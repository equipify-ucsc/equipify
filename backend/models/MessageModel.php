<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class MessageModel
{
    // Discovery follows rentals, customer jobs, delivery handoffs and owner maintenance.
    // Existing conversation access remains participant-based, independent of discovery.
    public const COUNTERPARTS = [
        'customer' => ['renting_party', 'freelance_worker', 'delivery_personnel'],
        'renting_party' => ['customer', 'delivery_personnel', 'maintenance_tech'],
        'freelance_worker' => ['customer'],
        'delivery_personnel' => ['customer', 'renting_party'],
        'maintenance_tech' => ['renting_party'],
    ];

    public static function searchUsers(int $userId, string $role, string $search): array
    {
        $roles = self::COUNTERPARTS[$role] ?? [];
        $search = trim($search);
        if (!$roles || $search === '') return [];
        $slots = implode(',', array_fill(0, count($roles), '?'));
        // Names only: email and other private profile fields are not exposed.
        $term = '%' . strtr(mb_substr($search, 0, 150), ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
        $stmt = getDbConnection()->prepare("SELECT user_id, full_name AS name, role FROM users
            WHERE user_id <> ? AND account_status = 'active' AND role IN ($slots)
            AND LOWER(full_name) LIKE LOWER(?) ESCAPE '!' ORDER BY full_name, user_id LIMIT 20");
        $stmt->execute(array_merge([$userId], $roles, [$term]));
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) $row['user_id'] = (string) $row['user_id'];
        return $rows;
    }

    public static function startConversation(int $userId, string $role, int $targetId): array
    {
        if ($userId === $targetId) throw new DomainException('Choose another person.');
        $db = getDbConnection();
        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) $db->beginTransaction();
        else $db->exec('SAVEPOINT message_start');
        try {
            // Serialize all starts involving this pair, including starts in the reverse direction.
            // Lock real user rows (which always exist), not a possibly absent conversation.
            $ids = [$userId, $targetId];
            sort($ids, SORT_NUMERIC);
            $users = [];
            $stmt = $db->prepare('SELECT user_id, full_name, role, account_status FROM users WHERE user_id = ? FOR UPDATE');
            foreach ($ids as $id) {
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if ($row) $users[$id] = $row;
            }
            $self = $users[$userId] ?? null;
            $target = $users[$targetId] ?? null;
            if (!$self || !$target || $self['role'] !== $role || $self['account_status'] !== 'active'
                || $target['account_status'] !== 'active'
                || !in_array($target['role'], self::COUNTERPARTS[$role] ?? [], true)) {
                throw new DomainException('This person is not available for a new conversation.');
            }
            // A group containing both users is not a direct conversation. A locking/current
            // read sees a start committed while we were waiting for the user locks.
            $stmt = $db->prepare('SELECT a.conversation_id FROM conversation_participants a
                JOIN conversation_participants b ON b.conversation_id = a.conversation_id AND b.user_id = ?
                LEFT JOIN conversation_participants extra ON extra.conversation_id = a.conversation_id
                    AND extra.user_id <> a.user_id AND extra.user_id <> b.user_id
                WHERE a.user_id = ? AND extra.user_id IS NULL ORDER BY a.conversation_id LIMIT 1 FOR UPDATE');
            $stmt->execute([$targetId, $userId]);
            $id = $stmt->fetchColumn();
            $created = $id === false;
            if ($created) {
                $db->exec('INSERT INTO conversations () VALUES ()');
                $id = $db->lastInsertId();
                $stmt = $db->prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)');
                $stmt->execute([$id, $userId, $id, $targetId]);
            }
            if ($ownsTransaction) $db->commit();
            else $db->exec('RELEASE SAVEPOINT message_start');
            return ['conversation_id' => (string) $id, 'party_name' => $target['full_name'],
                'party_role' => $target['role'], 'created' => $created];
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                if ($ownsTransaction) $db->rollBack();
                else { $db->exec('ROLLBACK TO SAVEPOINT message_start'); $db->exec('RELEASE SAVEPOINT message_start'); }
            }
            throw $e;
        }
    }

    public static function isParticipant(int $userId, int $conversationId): bool
    {
        $stmt = getDbConnection()->prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?');
        $stmt->execute([$conversationId, $userId]);
        return $stmt->fetchColumn() !== false;
    }

    public static function conversations(int $userId, string $search, int $page, int $perPage): array
    {
        $from = ' FROM conversation_participants cp JOIN conversations c ON c.conversation_id = cp.conversation_id
            LEFT JOIN messages latest ON latest.message_id = (SELECT MAX(m.message_id) FROM messages m WHERE m.conversation_id = c.conversation_id)
            WHERE cp.user_id = ?';
        $bind = [$userId];
        if ($search !== '') {
            $from .= ' AND (latest.body LIKE ? OR EXISTS (SELECT 1 FROM conversation_participants p JOIN users u ON u.user_id = p.user_id
                WHERE p.conversation_id = c.conversation_id AND p.user_id <> cp.user_id AND (u.full_name LIKE ? OR u.role LIKE ?)))';
            $bind = array_merge($bind, array_fill(0, 3, '%' . $search . '%'));
        }
        $db = getDbConnection();
        $stmt = $db->prepare('SELECT COUNT(*)' . $from);
        $stmt->execute($bind);
        $total = (int) $stmt->fetchColumn();
        $page = min($page, max(1, (int) ceil($total / $perPage)));
        $stmt = $db->prepare('SELECT c.conversation_id, latest.body AS last_message, latest.sent_at AS last_message_at,
            (SELECT COUNT(*) FROM messages unread WHERE unread.conversation_id = c.conversation_id
                AND unread.message_id > cp.last_read_message_id AND unread.sender_id <> cp.user_id) AS unread_count'
            . $from . ' ORDER BY COALESCE(latest.sent_at, c.created_at) DESC, c.conversation_id DESC LIMIT '
            . $perPage . ' OFFSET ' . (($page - 1) * $perPage));
        $stmt->execute($bind);
        $rows = $stmt->fetchAll();
        $participants = $db->prepare('SELECT u.full_name, u.role FROM conversation_participants p JOIN users u ON u.user_id = p.user_id
            WHERE p.conversation_id = ? AND p.user_id <> ? ORDER BY u.user_id');
        foreach ($rows as &$row) {
            $participants->execute([$row['conversation_id'], $userId]);
            $others = $participants->fetchAll();
            $row['party_name'] = implode(', ', array_column($others, 'full_name'));
            $row['party_role'] = implode(', ', array_unique(array_column($others, 'role')));
            $row['unread_count'] = (int) $row['unread_count'];
            $row['conversation_id'] = (string) $row['conversation_id'];
        }
        return ListQuery::envelope($rows, $page, $perPage, $total);
    }

    public static function messages(int $userId, int $conversationId, int $page, int $perPage, ?int $snapshot): array
    {
        if (!self::isParticipant($userId, $conversationId)) throw new DomainException('Conversation not found.');
        $db = getDbConnection();
        if ($snapshot === null) {
            $stmt = $db->prepare('SELECT COALESCE(MAX(message_id), 0) FROM messages WHERE conversation_id = ?');
            $stmt->execute([$conversationId]);
            $snapshot = (int) $stmt->fetchColumn();
        }
        $where = ' FROM messages m WHERE m.conversation_id = ? AND m.message_id <= ?
            AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = m.conversation_id AND cp.user_id = ?)';
        $bind = [$conversationId, $snapshot, $userId];
        $stmt = $db->prepare('SELECT COUNT(*)' . $where);
        $stmt->execute($bind);
        $total = (int) $stmt->fetchColumn();
        $stmt = $db->prepare('SELECT m.message_id, m.conversation_id, m.sender_id, m.body, m.sent_at' . $where
            . ' ORDER BY m.message_id DESC LIMIT ' . $perPage . ' OFFSET ' . (($page - 1) * $perPage));
        $stmt->execute($bind);
        $items = array_map(static fn(array $row): array => self::present($row, $userId), $stmt->fetchAll());
        // Advance only through messages actually returned, never a newer arrival.
        if ($items) self::markRead($userId, $conversationId, (int) $items[0]['message_id']);
        return ListQuery::envelope($items, $page, $perPage, $total) + ['snapshot_id' => (string) $snapshot];
    }

    public static function markRead(int $userId, int $conversationId, int $messageId): void
    {
        $stmt = getDbConnection()->prepare('UPDATE conversation_participants cp
            JOIN messages m ON m.conversation_id = cp.conversation_id AND m.message_id = ?
            SET cp.last_read_message_id = GREATEST(cp.last_read_message_id, m.message_id)
            WHERE cp.conversation_id = ? AND cp.user_id = ?');
        $stmt->execute([$messageId, $conversationId, $userId]);
    }

    public static function insert(int $userId, int $conversationId, string $body): array
    {
        $db = getDbConnection();
        $stmt = $db->prepare('INSERT INTO messages (conversation_id, sender_id, body, request_key)
            SELECT conversation_id, user_id, ?, ? FROM conversation_participants WHERE conversation_id = ? AND user_id = ?');
        $stmt->execute([$body, bin2hex(random_bytes(32)), $conversationId, $userId]);
        if ($stmt->rowCount() !== 1) throw new DomainException('Conversation not found.');
        $stmt = $db->prepare('SELECT message_id, conversation_id, sender_id, body, sent_at FROM messages WHERE message_id = ?');
        $stmt->execute([$db->lastInsertId()]);
        return self::present($stmt->fetch(), $userId);
    }

    private static function present(array $row, int $userId): array
    {
        $row['sender'] = (int) $row['sender_id'] === $userId ? 'me' : 'them';
        foreach (['message_id', 'conversation_id', 'sender_id'] as $key) $row[$key] = (string) $row[$key];
        return $row;
    }
}
