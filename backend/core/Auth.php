<?php
/**
 * Session-based identity. The signed-in user always comes from here, never from
 * an id in the request body or URL. The session is started in api/index.php.
 */

declare(strict_types=1);

final class Auth
{
    /** Marks the session as signed in as this user. Call after credentials are verified. */
    public static function login(int $userId, string $role): void
    {
        // A fresh session id on privilege change prevents session fixation.
        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        $_SESSION['role']    = $role;
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires'  => time() - 42000,
                'path'     => $p['path'],
                'domain'   => $p['domain'],
                'secure'   => $p['secure'],
                'httponly' => $p['httponly'],
                'samesite' => $p['samesite'] ?? 'Lax',
            ]);
        }
        session_destroy();
    }

    public static function userId(): ?int
    {
        return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
    }

    public static function role(): ?string
    {
        return isset($_SESSION['role']) ? (string) $_SESSION['role'] : null;
    }

    /**
     * Ends the request with 401 (not signed in) or 403 (wrong role) unless the
     * session user has one of the given roles.
     *
     * @param string[] $roles
     */
    public static function requireRole(array $roles): void
    {
        if (self::userId() === null) {
            Response::error('Please log in to continue.', 401);
        }
        if (!in_array(self::role(), $roles, true)) {
            Response::error('You do not have permission to do that.', 403);
        }
    }
}
