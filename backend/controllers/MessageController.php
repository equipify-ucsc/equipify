<?php
/**
 * In-app messaging for the roles whose threads are not yet in a table.
 *
 * Conversations and threads come from backend/fixtures/, and who may start a
 * thread with whom comes from RULES below — the same table the project brief
 * sets out, enforced here rather than trusted from the page.
 *
 * Two things have to survive a reload or the page looks broken: a message you
 * just sent, and a thread you just read. Both are kept per session (see
 * core/FixtureState.php) and laid over the fixture rows.
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/Fixtures.php';
require_once __DIR__ . '/../core/FixtureState.php';

final class MessageController
{
    public const MAX_MESSAGE_LENGTH = 2000;

    /** Who each role may open a conversation with. */
    private const RULES = [
        'customer'           => ['renting_party', 'freelance_worker', 'delivery_personnel', 'area_manager'],
        'renting_party'      => ['customer', 'maintenance_tech', 'delivery_personnel', 'area_manager'],
        'freelance_worker'   => ['customer'],
        'maintenance_tech'   => ['renting_party', 'area_manager'],
        'delivery_personnel' => ['customer', 'renting_party', 'area_manager'],
        'area_manager'       => ['delivery_personnel', 'customer', 'maintenance_tech', 'renting_party', 'admin'],
        'admin'              => ['customer', 'renting_party', 'freelance_worker', 'maintenance_tech', 'delivery_personnel', 'area_manager'],
    ];

    private const ROLE_LABELS = [
        'customer'           => 'Customer',
        'renting_party'      => 'Renting party',
        'freelance_worker'   => 'Freelance worker',
        'maintenance_tech'   => 'Technician',
        'delivery_personnel' => 'Delivery personnel',
        'area_manager'       => 'Area manager',
        'admin'              => 'Admin',
    ];

    private const SENT_BUCKET    = 'messages.sent';
    private const READ_BUCKET    = 'conversations.read';
    private const STARTED_BUCKET = 'conversations.started';

    // ----------------------------------------------------------- conversations

    /** GET /conversations?q=&page=&per_page= */
    public static function indexConversations(array $params = []): void
    {
        $q    = ListQuery::search();
        $rows = self::conversations();

        $envelope = ListQuery::paginate(
            $rows,
            ListQuery::page(),
            ListQuery::perPage(8),
            static fn (array $row): bool => ListQuery::contains(
                $q,
                (string) $row['party_name'],
                (string) $row['party_role'],
                (string) $row['context_ref'],
                (string) $row['last_message']
            )
        );
        $envelope['total_pages'] = max(1, (int) $envelope['total_pages']);

        Response::ok($envelope);
    }

    /** GET /conversations/{id} — for opening a thread straight from a link. */
    public static function showConversation(array $params = []): void
    {
        Response::ok(self::findConversationOr404((string) ($params['id'] ?? '')));
    }

    /**
     * POST /conversations — start one with somebody in the contacts list.
     * Returns the existing thread with 200 if there already is one.
     */
    public static function storeConversation(array $params = []): void
    {
        $in       = Router::jsonBody();
        $personId = is_string($in['person_id'] ?? null) ? trim($in['person_id']) : '';
        $context  = is_string($in['context_ref'] ?? null) ? trim($in['context_ref']) : '';

        $person = null;
        foreach (Fixtures::load('contacts')['people'] ?? [] as $candidate) {
            if ($candidate['person_id'] === $personId) {
                $person = $candidate;
                break;
            }
        }
        if ($person === null) {
            Response::error('That person is not in your contacts.', 404);
        }
        if (!in_array($person['role'], self::allowedRoles(), true)) {
            Response::error('You cannot start a conversation with that role.', 403);
        }

        // Reuse rather than duplicate: two threads with one person would split
        // the history in half.
        foreach (self::conversations() as $existing) {
            if ($existing['party_id'] === $personId) {
                Response::ok($existing);
            }
        }

        $id = 'new-' . $personId;
        FixtureState::put(self::STARTED_BUCKET, $id, [
            'conversation_id' => $id,
            'party_id'        => $person['person_id'],
            'party_name'      => $person['name'],
            'party_role_key'  => $person['role'],
            'party_detail'    => $person['detail'],
            'context_ref'     => $context,
            'minutes_ago'     => 0,
            'unread_count'    => 0,
        ]);

        Response::ok(self::findConversationOr404($id), 201);
    }

    // --------------------------------------------------------------- messages

    /** GET /messages?conversation_id=&page=&per_page= — newest first. */
    public static function index(array $params = []): void
    {
        $conversationId = (string) (ListQuery::search('conversation_id'));
        $conversation   = self::findConversationOr404($conversationId);

        // Opening a thread is what marks it read, the same as any mail client.
        FixtureState::put(self::READ_BUCKET, $conversation['conversation_id'], true);

        $thread = array_reverse(self::thread($conversation['conversation_id']));

        $envelope = ListQuery::paginate($thread, ListQuery::page(), ListQuery::perPage(12));
        $envelope['total_pages'] = max(1, (int) $envelope['total_pages']);

        Response::ok($envelope);
    }

    /** POST /messages */
    public static function store(array $params = []): void
    {
        $in             = Router::jsonBody();
        $conversationId = is_string($in['conversation_id'] ?? null) ? trim($in['conversation_id']) : '';
        $body           = is_string($in['body'] ?? null) ? trim($in['body']) : '';

        $conversation = self::findConversationOr404($conversationId);

        if ($body === '') {
            Response::error('Please fix the highlighted fields.', 422, ['body' => 'Write a message first.']);
        }
        if (mb_strlen($body) > self::MAX_MESSAGE_LENGTH) {
            Response::error('Please fix the highlighted fields.', 422, [
                'body' => 'A message can be at most ' . self::MAX_MESSAGE_LENGTH . ' characters.',
            ]);
        }

        $message = [
            'message_id'      => 'sent-' . bin2hex(random_bytes(6)),
            'conversation_id' => $conversation['conversation_id'],
            'sender'          => 'me',
            'body'            => $body,
            'sent_at'         => date('Y-m-d H:i:s'),
        ];
        FixtureState::push(self::SENT_BUCKET, $message);

        Response::ok($message, 201);
    }

    // --------------------------------------------------------------- contacts

    /** GET /messaging/contacts?q=&role=&page=&per_page= */
    public static function contacts(array $params = []): void
    {
        $allowed = self::allowedRoles();
        $q       = ListQuery::search();
        $role    = ListQuery::enum('role', $allowed);

        // A person this user already has a thread with carries its id, so the
        // page can open it instead of offering to start a second one.
        $existing = [];
        foreach (self::conversations() as $conversation) {
            $existing[$conversation['party_id']] = $conversation['conversation_id'];
        }

        $people = [];
        foreach (Fixtures::load('contacts')['people'] ?? [] as $person) {
            if (!in_array($person['role'], $allowed, true)) {
                continue;
            }
            $people[] = [
                'person_id'       => $person['person_id'],
                'name'            => $person['name'],
                'role'            => $person['role'],
                'role_label'      => self::ROLE_LABELS[$person['role']] ?? $person['role'],
                'detail'          => $person['detail'],
                'conversation_id' => $existing[$person['person_id']] ?? null,
            ];
        }

        $envelope = ListQuery::paginate(
            $people,
            ListQuery::page(),
            ListQuery::perPage(8),
            static function (array $person) use ($q, $role): bool {
                if ($role !== '' && $person['role'] !== $role) {
                    return false;
                }
                return ListQuery::contains($q, (string) $person['name'], (string) $person['detail']);
            }
        );
        $envelope['total_pages'] = max(1, (int) $envelope['total_pages']);

        Response::ok($envelope);
    }

    /** Unread messages across every thread, for the sidenav badge. */
    public static function unreadTotal(): int
    {
        $total = 0;
        foreach (self::conversations() as $conversation) {
            $total += (int) $conversation['unread_count'];
        }
        return $total;
    }

    // ---------------------------------------------------------------- helpers

    /** @return string[] the roles this user may open a conversation with */
    private static function allowedRoles(): array
    {
        return self::RULES[Auth::role() ?? ''] ?? [];
    }

    /**
     * Every conversation this role has, newest activity first, with sent
     * messages and read marks folded in.
     *
     * @return array<int,array<string,mixed>>
     */
    private static function conversations(): array
    {
        $read    = FixtureState::bucket(self::READ_BUCKET);
        $started = FixtureState::bucket(self::STARTED_BUCKET);
        $stored  = array_merge(Fixtures::forRole('conversations', Auth::role()), array_values($started));

        $rows = [];
        foreach ($stored as $conversation) {
            $thread = self::thread((string) $conversation['conversation_id']);
            $last   = $thread === [] ? null : $thread[count($thread) - 1];

            $rows[] = [
                'conversation_id' => (string) $conversation['conversation_id'],
                'party_id'        => $conversation['party_id'],
                'party_name'      => $conversation['party_name'],
                'party_role'      => self::ROLE_LABELS[$conversation['party_role_key']] ?? $conversation['party_role_key'],
                'party_role_key'  => $conversation['party_role_key'],
                'party_detail'    => $conversation['party_detail'],
                'context_ref'     => $conversation['context_ref'],
                'last_message'    => $last === null ? '' : $last['body'],
                'last_message_at' => $last === null
                    ? Fixtures::at((int) $conversation['minutes_ago'])
                    : $last['sent_at'],
                // Reading the thread clears it, and a message you sent yourself
                // was never unread.
                'unread_count'    => isset($read[$conversation['conversation_id']])
                    ? 0
                    : (int) $conversation['unread_count'],
                'can_start'       => in_array($conversation['party_role_key'], self::allowedRoles(), true),
            ];
        }

        usort($rows, static fn (array $a, array $b): int => strcmp($b['last_message_at'], $a['last_message_at']));
        return $rows;
    }

    /**
     * One thread, oldest first: the fixture messages plus anything sent this
     * session.
     *
     * @return array<int,array<string,mixed>>
     */
    private static function thread(string $conversationId): array
    {
        $rows = [];
        foreach (Fixtures::load('messages')[$conversationId] ?? [] as $message) {
            $rows[] = [
                'message_id'      => $message['message_id'],
                'conversation_id' => $conversationId,
                'sender'          => $message['sender'],
                'body'            => $message['body'],
                'sent_at'         => Fixtures::at((int) $message['minutes_ago']),
            ];
        }
        foreach (FixtureState::rows(self::SENT_BUCKET) as $message) {
            if ($message['conversation_id'] === $conversationId) {
                $rows[] = $message;
            }
        }

        usort($rows, static fn (array $a, array $b): int => strcmp($a['sent_at'], $b['sent_at']));
        return $rows;
    }

    /** @return array<string,mixed> ends the request with 404 when it is not this user's */
    private static function findConversationOr404(string $conversationId): array
    {
        foreach (self::conversations() as $conversation) {
            if ($conversation['conversation_id'] === $conversationId) {
                return $conversation;
            }
        }
        Response::error('Conversation not found.', 404);
    }
}
