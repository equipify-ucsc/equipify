<?php
/** Transport regression tests: mail() is disabled in subprocesses, so no SMTP is possible. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
if (($argv[1] ?? '') === '--case') {
    require __DIR__ . '/../services/Mailer.php';
    if (function_exists('mail')) throw new RuntimeException('Real mail must be disabled for this test.');
    $dir = __DIR__ . '/../../tmp/mailer-regression-' . bin2hex(random_bytes(6));
    putenv('EQUIPIFY_MAIL_FROM=sender@example.test');
    putenv('EQUIPIFY_MAIL_TRANSPORT=sendmail');
    putenv('EQUIPIFY_MAIL_ENABLE_SEND=' . ($argv[4] ?? '1'));
    putenv('EQUIPIFY_MAIL_FALLBACK=' . $argv[2]);
    putenv('EQUIPIFY_MAIL_DIRECTORY=' . $dir);
    $result = Mailer::send('recipient@example.test', 'Synthetic transport test', '<p>Synthetic body</p>');
    $expected = $argv[3] === 'true';
    if ($result !== $expected || count(glob($dir . '/*.eml') ?: []) !== ($expected ? 1 : 0))
        throw new RuntimeException('Incorrect fallback result/file count.');
    exit;
}
$checks = 0;
foreach (['', 'unavailable-test-transport'] as $sendmailPath) {
    foreach (['none', 'file'] as $fallback) {
        foreach (['0', '1'] as $enabled) {
            $command = [PHP_BINARY, '-d', 'disable_functions=mail', '-d', 'sendmail_path=' . $sendmailPath,
                __FILE__, '--case', $fallback, $fallback === 'file' ? 'true' : 'false', $enabled];
            $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
            if (!is_resource($process)) throw new RuntimeException('Cannot start test child.');
            $output = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
            fclose($pipes[1]); fclose($pipes[2]);
            if (proc_close($process) !== 0) throw new RuntimeException('Mailer child failed: ' . $output);
            $checks++;
        }
    }
}
echo "PASS: $checks isolated mail fallback regression cases; real mail disabled.\n";
