<?php
/** Offline formatting/validation tests. No database or network is used. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require_once __DIR__ . '/../services/Mailer.php';
require_once __DIR__ . '/../services/EmailTemplates.php';
putenv('EQUIPIFY_MAIL_TRANSPORT=file');
putenv('EQUIPIFY_MAIL_ENABLE_SEND=0');
putenv('EQUIPIFY_SENDMAIL_EXE=');
putenv('EQUIPIFY_MAIL_FROM=sender@example.test');
putenv('EQUIPIFY_MAIL_FROM_NAME=Equipify café');
$directory = __DIR__ . '/../../tmp/email-format-' . bin2hex(random_bytes(6));
putenv('EQUIPIFY_MAIL_DIRECTORY=' . $directory);
$checks = 0;
function check(bool $ok, string $label): void {
    global $checks;
    if (!$ok) throw new RuntimeException('FAIL: ' . $label);
    $checks++;
}
foreach (['otp','rental_accepted','payment_due','deadline_missed'] as $type) {
    $template = EmailTemplates::render($type, ['name' => 'Renée <script>fixture</script>',
        'otp' => '731946', 'reference' => '<REF-1>', 'due_at' => '<tomorrow>']);
    check(!str_contains($template['html'], '<script>') && str_contains($template['html'], '&lt;script&gt;'), 'Escaped name ' . $type);
    check(!str_contains($template['html'], '<tomorrow>'), 'Escaped due date ' . $type);
    check(Mailer::send('recipient@example.test', $template['subject'], $template['html']), 'Saved template ' . $type);
}
$messages = glob($directory . '/*.eml');
check(count($messages) === 4, 'All four messages saved');
foreach ($messages as $path) {
    $raw = file_get_contents($path);
    [$headers, $body] = explode("\r\n\r\n", $raw, 2);
    check(str_contains($headers, 'Content-Transfer-Encoding: quoted-printable'), 'MIME transfer encoding');
    check(str_contains($headers, 'Date: ') && str_contains($headers, 'charset=UTF-8'), 'Date and UTF-8 headers');
    $html = quoted_printable_decode($body);
    check(str_contains($html, 'Renée') && str_contains($html, '&lt;script&gt;') && str_contains($html, '</html>'), 'Round-trip rendered HTML');
    check(!preg_match('/(?<!\r)\n|\r(?!\n)/', $raw), 'CRLF wire format');
}
$subject = str_repeat('Equipify café ✓ ', 18);
check(Mailer::send('recipient@example.test', $subject, '<p>සිංහල / தமிழ் / café ✓</p>'), 'Unicode message');
$unicode = array_values(array_diff(glob($directory . '/*.eml'), $messages))[0];
$raw = file_get_contents($unicode);
preg_match('/^Subject: (.*?)(?=\r\n\S|\r\n\r\n)/ms', $raw, $match);
check(mb_decode_mimeheader($match[1]) === $subject, 'Folded Unicode subject round-trip');
check(max(array_map('strlen', explode("\r\n", $raw))) <= 998, 'Wire lines respect SMTP limit');
$before = count(glob($directory . '/*.eml'));
foreach (["bad\r\nBcc: other@example.test", 'not-an-email'] as $recipient) {
    check(!Mailer::send($recipient, 'Test', '<p>Test</p>'), 'Invalid recipient rejected');
}
foreach (["Injected\r\nBcc: other@example.test", "Null\0subject", '', "Invalid \xff"] as $invalid) {
    check(!Mailer::send('recipient@example.test', $invalid, '<p>Test</p>'), 'Invalid subject rejected');
}
check(!Mailer::send('recipient@example.test', 'Test', ''), 'Empty body rejected');
check(!Mailer::send('recipient@example.test', 'Test', "\xff"), 'Invalid UTF-8 body rejected');
putenv('EQUIPIFY_MAIL_FROM_NAME=bad' . "\r\nBcc: x@example.test");
check(!Mailer::send('recipient@example.test', 'Test', '<p>Test</p>'), 'Sender-name header injection rejected');
putenv('EQUIPIFY_MAIL_FROM_NAME=Equipify');
putenv('EQUIPIFY_MAIL_FROM=invalid');
check(!Mailer::send('recipient@example.test', 'Test', '<p>Test</p>'), 'Invalid sender rejected');
putenv('EQUIPIFY_MAIL_FROM=sender@example.test');
putenv('EQUIPIFY_MAIL_TRANSPORT=unknown');
check(!Mailer::send('recipient@example.test', 'Test', '<p>Test</p>'), 'Unknown transport rejected');
check(count(glob($directory . '/*.eml')) === $before, 'Validation failures never create file output');
putenv('EQUIPIFY_MAIL_TRANSPORT=file');
putenv('EQUIPIFY_MAIL_DIRECTORY=' . __FILE__);
check(!Mailer::send('recipient@example.test', 'Test', '<p>Test</p>'), 'Unusable output directory returns false');
putenv('EQUIPIFY_MAIL_TRANSPORT=sendmail');
putenv('EQUIPIFY_MAIL_FALLBACK=file');
check(!Mailer::send('recipient@example.test', 'Test', '<p>Test</p>'), 'Failed file fallback cannot claim success');
foreach (['unknown','otp','rental_accepted','payment_due','deadline_missed'] as $type) {
    try { EmailTemplates::render($type, []); throw new RuntimeException('Template validation was bypassed.'); }
    catch (InvalidArgumentException $e) { check(true, 'Template fields/type validated'); }
}
foreach (['otp','rental_accepted','payment_due','deadline_missed'] as $type) {
    try { EmailTemplates::render($type, ['name' => 'Fixture']); throw new RuntimeException('Template detail validation was bypassed.'); }
    catch (InvalidArgumentException $e) { check(true, 'Required OTP/reference validated'); }
}
echo "PASS: $checks offline email formatting, validation and template checks; no SMTP possible.\n";
