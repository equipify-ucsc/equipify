<?php
/** Test-only native transport driver; refuses any non-loopback sendmail profile. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require_once __DIR__ . '/../services/Mailer.php';
require_once __DIR__ . '/../services/EmailTemplates.php';
$executable = getenv('EQUIPIFY_SENDMAIL_EXE') ?: '';
$config = @parse_ini_file(dirname($executable) . '/sendmail.ini', true, INI_SCANNER_RAW);
if (($config['sendmail']['smtp_server'] ?? '') !== '127.0.0.1'
    || (int) ($config['sendmail']['smtp_port'] ?? 0) < 1024) {
    throw new RuntimeException('Only an explicitly generated loopback SMTP fixture is allowed.');
}
$mode = $argv[1] ?? '';
$results = [];
foreach ($mode === 'templates' ? ['otp','rental_accepted','payment_due','deadline_missed'] : ['unicode'] as $type) {
    if ($type === 'unicode') {
        $subject = str_repeat('Equipify café ✓ ', 18);
        $html = '<p>Unicode: සිංහල / தமிழ் / café ✓</p>';
    } else {
        $template = EmailTemplates::render($type, ['name' => 'Renée <script>fixture</script>',
            'otp' => '731946', 'reference' => 'SMTP-TEST-ONLY', 'due_at' => '<tomorrow>']);
        $subject = $template['subject']; $html = $template['html'];
    }
    $results[] = Mailer::send('recipient@example.test', $subject, $html);
}
echo json_encode($results, JSON_THROW_ON_ERROR), "\n";
