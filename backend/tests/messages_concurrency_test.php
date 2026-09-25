<?php
/** Two real database connections verify reverse-direction starts serialize. No data is retained. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../models/MessageModel.php';
$db = getDbConnection();
if (($argv[1] ?? '') === '--worker') {
    $db->beginTransaction();
    try {
        echo "READY\n"; flush();
        $result = MessageModel::startConversation((int) $argv[2], $argv[3], (int) $argv[4]);
        echo json_encode($result) . "\n";
    } finally { $db->rollBack(); }
    exit;
}
$pairs = $db->query("SELECT a.user_id AS first_id, ua.role AS first_role, b.user_id AS second_id, ub.role AS second_role,
    a.conversation_id FROM conversation_participants a
    JOIN conversation_participants b ON b.conversation_id = a.conversation_id AND a.user_id < b.user_id
    JOIN users ua ON ua.user_id = a.user_id JOIN users ub ON ub.user_id = b.user_id
    WHERE ua.account_status = 'active' AND ub.account_status = 'active'
    AND (SELECT COUNT(*) FROM conversation_participants p WHERE p.conversation_id = a.conversation_id) = 2
    ORDER BY a.conversation_id")->fetchAll();
$pair = null;
foreach ($pairs as $row) {
    if (in_array($row['second_role'], MessageModel::COUNTERPARTS[$row['first_role']] ?? [], true)) { $pair = $row; break; }
}
if (!$pair) { echo "SKIP: concurrency check needs an existing allowed direct conversation.\n"; exit; }
$db->beginTransaction();
$process = null;
$outputPath = tempnam(__DIR__, 'message-race-out-');
$errorPath = tempnam(__DIR__, 'message-race-err-');
try {
    $first = MessageModel::startConversation((int) $pair['first_id'], $pair['first_role'], (int) $pair['second_id']);
    if ($first['created']) throw new RuntimeException('Expected an existing thread');
    $process = proc_open([PHP_BINARY, __FILE__, '--worker', $pair['second_id'], $pair['second_role'], $pair['first_id']],
        [0 => ['pipe', 'r'], 1 => ['file', $outputPath, 'w'], 2 => ['file', $errorPath, 'w']], $pipes);
    if (!is_resource($process)) throw new RuntimeException('Cannot start concurrency worker');
    fclose($pipes[0]);
    $output = '';
    $deadline = microtime(true) + 10;
    while (strpos($output, "READY\n") === false && microtime(true) < $deadline) {
        $output = (string) file_get_contents($outputPath); usleep(10000);
    }
    if (strpos($output, "READY\n") === false) throw new RuntimeException('Worker did not become ready');
    usleep(200000);
    $output = (string) file_get_contents($outputPath);
    if (strpos($output, 'conversation_id') !== false) throw new RuntimeException('Reverse start bypassed user locks');
    $db->rollBack();
    while (strpos($output, 'conversation_id') === false && microtime(true) < $deadline) {
        $output = (string) file_get_contents($outputPath); usleep(10000);
    }
    $lines = explode("\n", trim($output));
    $second = json_decode($lines[1] ?? '', true);
    if (!$second || $second['created'] || $second['conversation_id'] !== $first['conversation_id']) {
        throw new RuntimeException('Concurrent reverse start did not reuse the same thread: ' . file_get_contents($errorPath));
    }
    echo "PASS: reverse start waited for the transaction lock, then reused the same direct conversation.\n";
} finally {
    if ($db->inTransaction()) $db->rollBack();
    if (is_resource($process)) {
        if (proc_get_status($process)['running']) proc_terminate($process);
        proc_close($process);
    }
    unlink($outputPath); unlink($errorPath);
}
