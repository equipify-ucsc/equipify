<?php
/**
 * A MOCK email transport. Nothing is sent anywhere.
 *
 * Every message is written to backend/storage/mail/ as a plain .eml-style text
 * file -- To/Subject/Date headers, a blank line, then the body -- so on a local
 * machine you read a "sent" email with `cat` or your editor:
 *
 *     ls -t backend/storage/mail | head -1
 *
 * A one-line summary also goes through error_log(), which on the PHP built-in
 * dev server prints in the terminal you started it in, so a reset link is
 * usually already on screen without opening anything.
 *
 * That folder is not reachable over HTTP: backend/storage/.htaccess denies it
 * on Apache and dev-router.php blocks it on the dev server. The files are
 * readable from disk only, which is the point -- they hold live reset links.
 *
 * Replacing this with a real transport means rewriting the body of send() and
 * nothing else. Callers only ever see void.
 */

declare(strict_types=1);

final class Mailer
{
    private const DIR = __DIR__ . '/../storage/mail/';

    /** Keeps the folder from filling up over a long dev session. */
    private const KEEP_FILES = 200;

    /**
     * "Sends" one message by writing it to the mail folder.
     *
     * Failures here are logged and swallowed rather than thrown: a caller that
     * has already reset a password or issued a token must not turn a disk
     * problem into a 500 the user cannot act on.
     */
    public static function send(string $to, string $subject, string $body): void
    {
        $message = "To: {$to}\n"
            . "Subject: {$subject}\n"
            . 'Date: ' . date('r') . "\n"
            . "X-Equipify-Mailer: mock (written to disk, not sent)\n"
            . "\n"
            . $body . "\n";

        $path = self::DIR . date('Y-m-d_His') . '_' . self::slug($to) . '.eml';

        if (!is_dir(self::DIR) && !@mkdir(self::DIR, 0770, true) && !is_dir(self::DIR)) {
            error_log('Mailer: cannot create ' . self::DIR);
            return;
        }
        // Unique suffix if two messages land in the same second.
        if (file_exists($path)) {
            $path = substr($path, 0, -4) . '_' . substr(bin2hex(random_bytes(2)), 0, 4) . '.eml';
        }
        if (@file_put_contents($path, $message, LOCK_EX) === false) {
            error_log('Mailer: cannot write ' . $path);
            return;
        }
        @chmod($path, 0640);

        error_log(sprintf('Mailer (mock): "%s" to %s -> %s', $subject, $to, basename($path)));
        self::prune();
    }

    /** A filename-safe stub of the address, so the folder is skimmable. */
    private static function slug(string $email): string
    {
        $slug = strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', $email) ?? '');
        return trim(substr($slug, 0, 40), '-') ?: 'message';
    }

    /** Drops the oldest files once there are more than KEEP_FILES. */
    private static function prune(): void
    {
        $files = glob(self::DIR . '*.eml') ?: [];
        if (count($files) <= self::KEEP_FILES) {
            return;
        }
        sort($files); // names start with the timestamp, so this is oldest first
        foreach (array_slice($files, 0, count($files) - self::KEEP_FILES) as $old) {
            @unlink($old);
        }
    }
}
