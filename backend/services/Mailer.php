<?php
declare(strict_types=1);

/** Returns transport acceptance, not a guarantee of mailbox delivery. Never logs message content. */
final class Mailer
{
    public static function send(string $to, string $subject, string $html): bool
    {
        $from = getenv('EQUIPIFY_MAIL_FROM') ?: '';
        $name = getenv('EQUIPIFY_MAIL_FROM_NAME') ?: 'Equipify';
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL)
            || preg_match('/[\r\n]/', $to . $from . $name . $subject)) return false;
        $headers = 'From: =?UTF-8?B?' . base64_encode($name) . '?= <' . $from . ">\r\n"
            . "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8";
        $transport = getenv('EQUIPIFY_MAIL_TRANSPORT') ?: 'file';
        if ($transport === 'sendmail') {
            // Explicit opt-in prevents accidental live mail from default installs/tests.
            if (getenv('EQUIPIFY_MAIL_ENABLE_SEND') === '1' && trim((string) ini_get('sendmail_path')) !== '') {
                try { if (@mail($to, $subject, $html, $headers)) return true; }
                catch (Throwable $e) { /* Do not log addresses, message bodies or SMTP diagnostics. */ }
            }
            // An unavailable/disabled transport follows the same explicit policy
            // as a failed send. File output never implies SMTP delivery.
            if (getenv('EQUIPIFY_MAIL_FALLBACK') !== 'file') return false;
        } elseif ($transport !== 'file') return false;
        $dir = getenv('EQUIPIFY_MAIL_DIRECTORY') ?: __DIR__ . '/../../tmp/mail';
        try {
            if (!is_dir($dir) && !@mkdir($dir, 0700, true)) return false;
            $message = 'To: ' . $to . "\r\nSubject: =?UTF-8?B?" . base64_encode($subject)
                . "?=\r\n" . $headers . "\r\n\r\n" . $html;
            return @file_put_contents($dir . '/' . bin2hex(random_bytes(16)) . '.eml', $message, LOCK_EX) !== false;
        } catch (Throwable $e) { return false; }
    }
}
