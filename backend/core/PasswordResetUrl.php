<?php
declare(strict_types=1);

/** Builds links only from deployment configuration, never Host/forwarded headers. */
final class PasswordResetUrl
{
    public static function build(string $token): string
    {
        if (!preg_match('/\A[a-f0-9]{64}\z/D', $token)) {
            throw new InvalidArgumentException('Invalid reset token.');
        }
        $base = getenv('EQUIPIFY_PASSWORD_RESET_URL') ?: '';
        $parts = parse_url($base);
        if ($parts === false || !isset($parts['host'], $parts['scheme'])
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
            || preg_match('/[\x00-\x20\x7f\\\\]/', $base)
            || !filter_var($base, FILTER_VALIDATE_URL)) {
            throw new RuntimeException('Configure a trusted password reset URL.');
        }
        $local = in_array(strtolower($parts['host']), ['localhost', '127.0.0.1', '[::1]'], true);
        if ($parts['scheme'] !== 'https' && !($parts['scheme'] === 'http' && $local)) {
            throw new RuntimeException('Password reset URLs require HTTPS outside localhost.');
        }
        return $base . '?token=' . rawurlencode($token);
    }
}
