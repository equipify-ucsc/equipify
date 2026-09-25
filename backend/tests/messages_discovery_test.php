<?php
/** Uses real accounts only; new direct threads are exercised inside a rolled-back transaction. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/messages_test.php';
$discoveryStart = $checks;
$_SESSION = [];
response(static function () { MessageController::users(); }, 401);
response(static function () { MessageController::startConversation(); }, 401);
$accounts = $db->query('SELECT user_id, role, full_name, account_status FROM users ORDER BY user_id')->fetchAll();
$beforeConversations = $db->query('SELECT * FROM conversations ORDER BY conversation_id')->fetchAll();
$beforeParticipants = $db->query('SELECT * FROM conversation_participants ORDER BY conversation_id, user_id')->fetchAll();
$beforeMessages = $db->query('SELECT * FROM messages ORDER BY message_id')->fetchAll();
$createdChecks = 0;
$reusedChecks = 0;
$db->beginTransaction();
try {
    foreach (MessageModel::COUNTERPARTS as $role => $allowed) {
        check(!in_array('admin', $allowed, true) && !in_array('area_manager', $allowed, true), 'No privileged discovery');
        foreach ($allowed as $otherRole) check(in_array($role, MessageModel::COUNTERPARTS[$otherRole], true), 'Symmetric counterpart rule');
    }
    foreach ($accounts as $actor) {
        if (!isset(MessageModel::COUNTERPARTS[$actor['role']]) || $actor['account_status'] !== 'active') continue;
        $uid = (int) $actor['user_id'];
        $_SESSION = ['user_id' => $uid, 'role' => $actor['role']];
        $_GET = [];
        check(response(static function () { MessageController::users(); }, 200)['data']['items'] === [], 'Empty search does not enumerate accounts');
        Router::$input = ['participant_user_id' => $uid];
        response(static function () { MessageController::startConversation(); }, 422);
        Router::$input = ['participant_user_id' => PHP_INT_MAX];
        response(static function () { MessageController::startConversation(); }, 422);
        foreach ($accounts as $target) {
            $targetId = (int) $target['user_id'];
            $allowed = $uid !== $targetId && $target['account_status'] === 'active'
                && in_array($target['role'], MessageModel::COUNTERPARTS[$actor['role']], true);
            $_GET = ['search' => mb_strtoupper(mb_substr($target['full_name'], 0, 3)), 'role' => 'admin', 'user_id' => $targetId];
            $result = response(static function () { MessageController::users(); }, 200)['data'];
            check(count($result['items']) <= 20, 'Search limit');
            foreach ($result['items'] as $person) {
                check((int) $person['user_id'] !== $uid, 'Search excludes self');
                check(in_array($person['role'], MessageModel::COUNTERPARTS[$actor['role']], true), 'Search enforces backend roles');
                check(array_keys($person) === ['user_id', 'name', 'role'], 'Only public display fields returned');
            }
            $ids = array_column($result['items'], 'user_id');
            if (!$allowed) {
                check(!in_array((string) $targetId, $ids, true), 'Forbidden target excluded');
                Router::$input = ['participant_user_id' => $targetId, 'role' => 'customer', 'user_id' => 4];
                response(static function () { MessageController::startConversation(); }, 422);
                continue;
            }
            if (count($result['items']) < 20) check(in_array((string) $targetId, $ids, true), 'Case-insensitive partial name match');
            $count = (int) $db->query('SELECT COUNT(*) FROM conversations')->fetchColumn();
            // Determine whether this real pair already has an exact two-participant thread.
            $find = $db->prepare('SELECT a.conversation_id FROM conversation_participants a
                JOIN conversation_participants b ON b.conversation_id = a.conversation_id
                WHERE a.user_id = ? AND b.user_id = ? AND
                (SELECT COUNT(*) FROM conversation_participants p WHERE p.conversation_id = a.conversation_id) = 2
                ORDER BY a.conversation_id LIMIT 1');
            $find->execute([$uid, $targetId]);
            $existingId = $find->fetchColumn();
            Router::$input = ['participant_user_id' => $targetId, 'sender_id' => PHP_INT_MAX, 'role' => 'admin'];
            $opened = response(static function () { MessageController::startConversation(); }, $existingId === false ? 201 : 200)['data'];
            if ($existingId !== false) {
                check($opened['conversation_id'] === (string) $existingId, 'Existing direct conversation reused');
                $reusedChecks++;
            } else $createdChecks++;
            $members = $db->prepare('SELECT user_id FROM conversation_participants WHERE conversation_id = ? ORDER BY user_id');
            $members->execute([$opened['conversation_id']]);
            $expected = [$uid, $targetId]; sort($expected);
            check(array_map('intval', $members->fetchAll(PDO::FETCH_COLUMN)) === $expected, 'Exactly two correct participants');
            $again = response(static function () { MessageController::startConversation(); }, 200)['data'];
            check($again['conversation_id'] === $opened['conversation_id'], 'Repeated start reuses thread');
            $reverse = MessageModel::startConversation($targetId, $target['role'], $uid);
            check($reverse['conversation_id'] === $opened['conversation_id'], 'Reverse start reuses thread');
            check((int) $db->query('SELECT COUNT(*) FROM conversations')->fetchColumn() === $count + ($existingId === false ? 1 : 0), 'No duplicate conversation');
            check(MessageModel::isParticipant($uid, (int) $opened['conversation_id']), 'Actor can open resulting conversation');
        }
    }
} finally { $db->rollBack(); }
check($db->query('SELECT * FROM conversations ORDER BY conversation_id')->fetchAll() === $beforeConversations, 'Original conversations preserved');
check($db->query('SELECT * FROM conversation_participants ORDER BY conversation_id, user_id')->fetchAll() === $beforeParticipants, 'Original participants preserved');
check($db->query('SELECT * FROM messages ORDER BY message_id')->fetchAll() === $beforeMessages, 'Original messages preserved');
echo 'PASS: ' . ($checks - $discoveryStart) . " discovery/start checks; $createdChecks new real-account pairs rolled back; $reusedChecks existing/repeated pairs reused.\n";
