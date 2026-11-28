<?php
declare(strict_types=1);
require_once __DIR__ . '/SendmailTransport.php';

/** Returns transport acceptance, not a guarantee of mailbox delivery. Never logs message content. */
final class Mailer
{
    public static function send(string $to, string $subject, string $html): bool
    {
        $from = getenv('EQUIPIFY_MAIL_FROM') ?: '';
        $name = getenv('EQUIPIFY_MAIL_FROM_NAME') ?: 'Equipify';
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL)
            || preg_match('/[\x00-\x1f\x7f]/', $to . $from . $name . $subject)
            || trim($subject) === '' || trim($html) === ''
            || !mb_check_encoding($name . $subject . $html, 'UTF-8')) return false;
        $headers = 'From: =?UTF-8?B?' . base64_encode($name) . '?= <' . $from . ">\r\n"
            . "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable";
        $encodedSubject = mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n", 9);
        $encodedBody = quoted_printable_encode(str_replace(["\r\n", "\r"], "\n", $html));
        $encodedBody = str_replace("\n", "\r\n", str_replace("\r\n", "\n", $encodedBody));
        $message = 'To: ' . $to . "\r\nSubject: " . $encodedSubject . "\r\nDate: " . date(DATE_RFC2822)
            . "\r\n" . $headers . "\r\n\r\n" . $encodedBody . "\r\n";
        $transport = getenv('EQUIPIFY_MAIL_TRANSPORT') ?: 'file';
        if ($transport === 'sendmail') {
            // Explicit opt-in prevents accidental live mail from default installs/tests.
            if (getenv('EQUIPIFY_MAIL_ENABLE_SEND') === '1') {
                $executable = getenv('EQUIPIFY_SENDMAIL_EXE') ?: '';
                if ($executable !== '') {
                    if (SendmailTransport::send($executable, $message)) return true;
                } elseif (trim((string) ini_get('sendmail_path')) !== '') {
                    try { if (@mail($to, $encodedSubject, $encodedBody, $headers)) return true; }
                    catch (Throwable $e) { /* Do not log addresses, message bodies or SMTP diagnostics. */ }
                }
            }
            // An unavailable/disabled transport follows the same explicit policy
            // as a failed send. File output never implies SMTP delivery.
            if (getenv('EQUIPIFY_MAIL_FALLBACK') !== 'file') return false;
        } elseif ($transport !== 'file') return false;
        $dir = getenv('EQUIPIFY_MAIL_DIRECTORY') ?: __DIR__ . '/../../tmp/mail';
        try {
            if (!is_dir($dir) && !@mkdir($dir, 0700, true)) return false;
            return @file_put_contents($dir . '/' . bin2hex(random_bytes(16)) . '.eml', $message, LOCK_EX) !== false;
        } catch (Throwable $e) { return false; }
    }
}
