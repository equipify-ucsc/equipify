<?php
/** CLI-only template verification, never a rental/payment/agreement event. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../services/Mailer.php';
require_once __DIR__ . '/../services/EmailTemplates.php';
$send = in_array('--send-approved-test', $argv, true);
$preview = in_array('--preview', $argv, true);
if ($send === $preview) {
    fwrite(STDERR, "Choose --preview or --send-approved-test. No mail sent.\n");
    exit(2);
}
$recipient = $send ? (getenv('EQUIPIFY_MAIL_TEST_RECIPIENT') ?: '') : 'recipient@example.test';
if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || preg_match('/[\x00-\x1f\x7f]/', $recipient)) {
    fwrite(STDERR, "Set a valid explicitly approved test recipient. No mail sent.\n");
    exit(2);
}
if ($send && (getenv('EQUIPIFY_MAIL_TRANSPORT') !== 'sendmail' || getenv('EQUIPIFY_MAIL_ENABLE_SEND') !== '1'
    || !is_file(getenv('EQUIPIFY_SENDMAIL_EXE') ?: ''))) {
    fwrite(STDERR, "A configured native profile, explicit sendmail transport and send enablement are required. No mail sent.\n");
    exit(2);
}
$keys = ['EQUIPIFY_MAIL_TRANSPORT', 'EQUIPIFY_MAIL_FALLBACK', 'EQUIPIFY_MAIL_FROM', 'EQUIPIFY_MAIL_DIRECTORY'];
$previous = [];
foreach ($keys as $key) $previous[$key] = getenv($key);
$failed = false;
try {
    // A saved file must never masquerade as SMTP acceptance in this verifier.
    putenv('EQUIPIFY_MAIL_FALLBACK=');
    if ($preview) {
        putenv('EQUIPIFY_MAIL_TRANSPORT=file');
        putenv('EQUIPIFY_MAIL_FROM=sender@example.test');
        putenv('EQUIPIFY_MAIL_DIRECTORY=' . __DIR__ . '/../../tmp/email-preview-' . bin2hex(random_bytes(6)));
    }
    foreach (['otp', 'rental_accepted', 'payment_due', 'deadline_missed'] as $type) {
        $template = EmailTemplates::render($type, ['name' => 'SMTP verification',
            'otp' => (string) random_int(100000, 999999), 'reference' => 'SMTP-TEST-' . bin2hex(random_bytes(4)),
            'due_at' => 'Synthetic test date']);
        $html = str_replace('</body>', '<p>SMTP verification only. Synthetic data; no agreement, rental or payment was created.</p></body>', $template['html']);
        $ok = Mailer::send($recipient, '[Equipify SMTP test] ' . $template['subject'], $html);
        echo $type . ': ' . ($ok ? ($preview ? 'preview saved' : 'transport accepted; inbox receipt UNVERIFIED') : 'FAILED') . "\n";
        if (!$ok) { $failed = true; break; }
    }
} finally {
    foreach ($previous as $key => $value) putenv($value === false ? $key : $key . '=' . $value);
}
exit($failed ? 1 : 0);
