<?php
/** CLI tests. No fixtures or schema changes; optional existing-data checks always roll back. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

final class CapturedResponse extends RuntimeException
{
    public array $body;
    public function __construct(int $status, array $body) { parent::__construct('response', $status); $this->body = $body; }
}
final class Response
{
    public static function ok($data = null, int $status = 200): void { throw new CapturedResponse($status, ['data' => $data]); }
    public static function error(string $message, int $status = 400, array $fields = []): void
    { throw new CapturedResponse($status, ['error' => $message, 'fields' => $fields]); }
}
final class Router
{
    public static array $input = [];
    public static function jsonBody(): array { return self::$input; }
}
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Validator.php';
require_once __DIR__ . '/../core/ListQuery.php';
require_once __DIR__ . '/../controllers/MessageController.php';
$checks = 0;
function check(bool $condition, string $label): void
{
    global $checks;
    if (!$condition) throw new RuntimeException('FAILED: ' . $label);
    $checks++;
}
function response(callable $call, int $status): array
{
    try { $call(); } catch (CapturedResponse $res) {
        check($res->getCode() === $status, 'HTTP status ' . $status);
        return $res->body;
    }
    throw new RuntimeException('No response');
}
$_SESSION = [];
foreach (['conversations', 'messages', 'sendMessage'] as $method) {
    response(static function () use ($method) { MessageController::$method(); }, 401);
}
$_SESSION = ['user_id' => PHP_INT_MAX, 'role' => 'admin'];
response(static function () { MessageController::conversations(); }, 403);
$_SESSION['role'] = 'freelance_worker';
$_GET = [];
response(static function () { MessageController::messages(); }, 422);
foreach (['', '   ', str_repeat('x', 2001), str_repeat('界', 2001), ['invalid']] as $body) {
    Router::$input = ['conversation_id' => 1, 'body' => $body];
    $result = response(static function () { MessageController::sendMessage(); }, 422);
    check(isset($result['fields']['body']), 'Body validation');
}
$db = getDbConnection();
$_GET = ['conversation_id' => PHP_INT_MAX];
response(static function () { MessageController::messages(); }, 404);
Router::$input = ['conversation_id' => PHP_INT_MAX, 'body' => 'Access check'];
response(static function () { MessageController::sendMessage(); }, 404);
$_GET = [];
$list = response(static function () { MessageController::conversations(); }, 200)['data'];
check($list['items'] === [] && $list['total'] === 0, 'No conversations exposed to nonparticipant');
foreach (['search', "%' OR 1=1 --"] as $search) {
    check(MessageModel::conversations(PHP_INT_MAX, $search, 1, 8)['total'] === 0, 'Prepared search preserves scope');
}
try {
    MessageModel::insert(PHP_INT_MAX, PHP_INT_MAX, 'Access check');
    throw new RuntimeException('Unauthorized model insert accepted');
} catch (DomainException $e) { check(true, 'Insert SQL independently enforces membership'); }

// Reuse real data only. Passing --existing-data opts into rolled-back message/read writes.
$existingRows = $db->query("SELECT p.user_id, p.conversation_id, u.role FROM conversation_participants p
    JOIN users u ON u.user_id = p.user_id
    WHERE u.role IN ('customer','freelance_worker','renting_party','delivery_personnel','maintenance_tech')
    AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = p.conversation_id)
    ORDER BY p.conversation_id, p.user_id")->fetchAll();
// Exercise all role gates even when that role currently has no conversations.
foreach (MessageController::ROLES as $role) {
    $stmt = $db->prepare('SELECT user_id FROM users WHERE role = ? LIMIT 1');
    $stmt->execute([$role]);
    $actorId = (int) ($stmt->fetchColumn() ?: PHP_INT_MAX);
    $_SESSION = ['user_id' => $actorId, 'role' => $role];
    $_GET = ['per_page' => 1];
    $own = response(static function () { MessageController::conversations(); }, 200)['data'];
    $stmt = $db->prepare('SELECT COUNT(*) FROM conversation_participants WHERE user_id = ?');
    $stmt->execute([$actorId]);
    check($own['total'] === (int) $stmt->fetchColumn(), $role . ' lists only own conversations');
    check(count($own['items']) <= 1, $role . ' list page size');
    $_GET = ['conversation_id' => PHP_INT_MAX, 'user_id' => 3, 'role' => 'freelance_worker'];
    response(static function () { MessageController::messages(); }, 404);
    Router::$input = ['conversation_id' => PHP_INT_MAX, 'body' => 'Access check', 'user_id' => 3];
    response(static function () { MessageController::sendMessage(); }, 404);
}
$beforeMessages = $db->query('SELECT * FROM messages ORDER BY message_id')->fetchAll();
$beforeParticipants = $db->query('SELECT * FROM conversation_participants ORDER BY conversation_id, user_id')->fetchAll();
if (!$existingRows || !in_array('--existing-data', $argv, true)) {
    echo "SKIP: populated-thread, insert, unread and read-marker checks need an existing populated operational thread and --existing-data.\n";
} else {
  foreach ($existingRows as $existing) {
    $uid = (int) $existing['user_id'];
    $cid = (int) $existing['conversation_id'];
    $db->beginTransaction();
    try {
        $_SESSION = ['user_id' => $uid, 'role' => $existing['role']];
        $list = MessageModel::conversations($uid, '', 1, 50);
        $otherMarkers = $db->prepare('SELECT user_id, last_read_message_id FROM conversation_participants WHERE conversation_id = ? AND user_id <> ? ORDER BY user_id');
        $otherMarkers->execute([$cid, $uid]);
        $otherBefore = $otherMarkers->fetchAll();
        $name = $db->prepare('SELECT u.full_name FROM users u JOIN conversation_participants p ON p.user_id = u.user_id WHERE p.conversation_id = ? AND p.user_id <> ? LIMIT 1');
        $name->execute([$cid, $uid]);
        $searchName = $name->fetchColumn();
        if ($searchName !== false) {
            $matches = MessageModel::conversations($uid, (string) $searchName, 1, 50);
            check(in_array((string) $cid, array_column($matches['items'], 'conversation_id'), true), 'Participant search finds thread');
        }
        check(MessageModel::conversations($uid, bin2hex(random_bytes(24)), 1, 50)['total'] === 0, 'Nonmatching search');
        foreach ($list['items'] as $item) check(MessageModel::isParticipant($uid, (int) $item['conversation_id']), 'Own conversations only');
        check($list['total'] > 0, 'Lists own conversations');
        $stmt = $db->prepare('UPDATE conversation_participants SET last_read_message_id = 0 WHERE conversation_id = ? AND user_id = ?');
        $stmt->execute([$cid, $uid]);
        $stmt = $db->prepare('SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND sender_id <> ?');
        $stmt->execute([$cid, $uid]);
        $expectedUnread = (int) $stmt->fetchColumn();
        $found = false;
        for ($page = 1; $page <= $list['total_pages']; $page++) {
            foreach (MessageModel::conversations($uid, '', $page, 50)['items'] as $item) {
                if ((int) $item['conversation_id'] === $cid) {
                    check($item['unread_count'] === $expectedUnread, 'Incoming unread count');
                    $found = true;
                }
            }
        }
        check($found, 'Own thread returned');
        $_GET = ['conversation_id' => $cid, 'per_page' => 1];
        $thread = response(static function () { MessageController::messages(); }, 200)['data'];
        check(count($thread['items']) === 1, 'Messages load with pagination');
        $latest = $thread['items'][0];
        check($latest['sender'] === ((int) $latest['sender_id'] === $uid ? 'me' : 'them'), 'Sender identity');
        $marker = $db->prepare('SELECT last_read_message_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?');
        $marker->execute([$cid, $uid]);
        check((string) $marker->fetchColumn() === $latest['message_id'], 'Read marker advances');
        $otherMarkers->execute([$cid, $uid]);
        check($otherMarkers->fetchAll() === $otherBefore, 'Opening leaves other participant markers unchanged');
        for ($page = 1; $page <= $list['total_pages']; $page++) {
            foreach (MessageModel::conversations($uid, '', $page, 50)['items'] as $item) {
                if ((int) $item['conversation_id'] === $cid) check($item['unread_count'] === 0, 'Reading clears incoming unread count');
            }
        }
        if ($thread['total'] > 1) {
            $earlier = MessageModel::messages($uid, $cid, 2, 1, (int) $thread['snapshot_id']);
            check((int) $earlier['items'][0]['message_id'] < (int) $latest['message_id'], 'Load earlier returns older messages');
        }
        MessageModel::markRead($uid, $cid, 0);
        $marker->execute([$cid, $uid]);
        check((string) $marker->fetchColumn() === $latest['message_id'], 'Read marker never goes backwards');
        // Copy an existing body inside this transaction, never seed a synthetic message.
        Router::$input = ['conversation_id' => $cid, 'body' => mb_substr($latest['body'], 0, 2000), 'user_id' => PHP_INT_MAX];
        $sent = response(static function () { MessageController::sendMessage(); }, 201)['data'];
        check((int) $sent['sender_id'] === $uid && $sent['sender'] === 'me', 'Session sender wins');
        $stmt = $db->prepare('SELECT body, request_key FROM messages WHERE message_id = ?');
        $stmt->execute([$sent['message_id']]);
        $stored = $stmt->fetch();
        check($stored['body'] === trim(Router::$input['body']), 'Valid message persists');
        check(preg_match('/^[a-f0-9]{64}$/D', $stored['request_key']) === 1, 'Secure request key');
        $refreshed = MessageModel::messages($uid, $cid, 1, 1, null);
        check($refreshed['items'][0]['message_id'] === $sent['message_id'], 'Fresh load sees stored message');
        $older = MessageModel::messages($uid, $cid, 2, 1, null);
        check($older['items'][0]['message_id'] === $latest['message_id'], 'Second page returns previous message');
        $stable = MessageModel::messages($uid, $cid, 1, 1, (int) $thread['snapshot_id']);
        check($stable['items'][0]['message_id'] === $latest['message_id'], 'New send does not shift history pages');
        $_SESSION['user_id'] = PHP_INT_MAX;
        response(static function () { MessageController::messages(); }, 404);
        response(static function () { MessageController::sendMessage(); }, 404);
    } finally { $db->rollBack(); }
  }
}
check($db->query('SELECT * FROM messages ORDER BY message_id')->fetchAll() === $beforeMessages, 'Original messages preserved');
check($db->query('SELECT * FROM conversation_participants ORDER BY conversation_id, user_id')->fetchAll() === $beforeParticipants, 'Original participants and read markers preserved');
echo "PASS: $checks messaging checks. No message or read-marker changes retained.\n";
