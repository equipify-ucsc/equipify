<?php
/**
 * "Forgot password": issue a one-hour reset link, then spend it to set a new
 * password. Open to everyone except admins, whose accounts are created by
 * backend/tools/create_admin.php and have no self-service reset.
 *
 * The email is written to disk by the mock core/Mailer.php; nothing is sent
 * over the network yet.
 *
 * Two rules shape most of the code below:
 *
 *  - The request endpoint must not reveal who has an account. Unknown address,
 *    suspended account, admin account and throttled account all produce the
 *    same 200 and the same words. This matches AuthController::login, which
 *    verifies against a dummy hash for the same reason.
 *  - A link is single use and short lived, and the token itself is never
 *    stored -- only its SHA-256 (see PasswordResetModel).
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/Mailer.php';
require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/PasswordResetModel.php';

final class PasswordResetController
{
    /** How long a link stays good. */
    private const TTL_MINUTES = 60;

    /** At most this many links per account per THROTTLE_MINUTES. */
    private const MAX_REQUESTS = 3;
    private const THROTTLE_MINUTES = 15;

    /**
     * Roles that may reset their own password. Admin is deliberately absent:
     * an admin address is treated exactly like an unknown one, because saying
     * "admins cannot reset" out loud would identify the admin accounts.
     */
    private const RESETTABLE_ROLES = [
        'customer', 'renting_party', 'freelance_worker',
        'maintenance_tech', 'delivery_personnel', 'area_manager',
    ];

    /** What each role calls itself in the email. */
    private const PORTAL_LABELS = [
        'customer'           => 'Customer',
        'renting_party'      => 'Renting Party',
        'freelance_worker'   => 'Freelance Worker',
        'maintenance_tech'   => 'Maintenance Technician',
        'delivery_personnel' => 'Delivery Personnel',
        'area_manager'       => 'Area Manager',
    ];

    /** Said whatever the outcome, so the response reveals nothing. */
    private const SENT_MESSAGE =
        'If that email has an account, a reset link is on its way. '
        . 'The link is valid for one hour.';

    /**
     * POST /auth/forgot-password  {email}
     *
     * Always 200 unless the address is not an email address at all.
     */
    public static function request(array $params = []): void
    {
        $in    = Router::jsonBody();
        $email = strtolower(is_string($in['email'] ?? null) ? trim($in['email']) : '');

        // The only thing worth rejecting: input that could not be an address.
        // Everything past here answers identically.
        if ($problem = Validator::email($email)) {
            Response::error('Please fix the highlighted fields.', 422, ['email' => $problem]);
        }

        $user = UserModel::findByEmail($email);
        if (self::eligible($user)) {
            self::issue((int) $user['user_id'], $email, (string) $user['role']);
        }

        Response::ok(['message' => self::SENT_MESSAGE]);
    }

    /**
     * GET /auth/reset-password?token=...
     *
     * Asked by the page on load, so a dead link shows as dead before the user
     * types a new password rather than after.
     */
    public static function check(array $params = []): void
    {
        $reset = self::findOr410(ListQuery::search('token'));

        Response::ok([
            'email' => $reset['email'],
            'role'  => $reset['role'],
        ]);
    }

    /**
     * POST /auth/reset-password  {token, password, confirm_password}
     */
    public static function reset(array $params = []): void
    {
        $in       = Router::jsonBody();
        $token    = is_string($in['token'] ?? null) ? trim($in['token']) : '';
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        $confirm  = is_string($in['confirm_password'] ?? null) ? $in['confirm_password'] : '';

        // The token first: no point complaining about the password on a link
        // that is already dead.
        $reset = self::findOr410($token);

        $errors = [];
        if ($problem = Validator::password($password)) {
            $errors['password'] = $problem;
        } elseif ($password !== $confirm) {
            $errors['confirm_password'] = 'Passwords do not match.';
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        $userId = (int) $reset['user_id'];

        // Spend the token before writing the password. If two submits race,
        // only the one that flips used_at proceeds.
        if (!PasswordResetModel::markUsed((int) $reset['reset_id'])) {
            self::linkDead();
        }

        UserModel::updatePasswordHash($userId, password_hash($password, PASSWORD_DEFAULT));

        // Any other link that was still outstanding dies with the change.
        PasswordResetModel::invalidateForUser($userId);

        Response::ok([
            'email'   => $reset['email'],
            'role'    => $reset['role'],
            'message' => 'Your password has been updated. You can sign in with it now.',
        ]);
    }

    // ------------------------------------------------------------- helpers

    /**
     * Whether this account gets a link at all. Anything false here is silent:
     * the caller still answers 200.
     *
     * @param array<string,mixed>|null $user
     */
    private static function eligible(?array $user): bool
    {
        return $user !== null
            && $user['account_status'] === 'active'
            && in_array($user['role'], self::RESETTABLE_ROLES, true)
            && PasswordResetModel::recentCountForUser(
                (int) $user['user_id'],
                self::THROTTLE_MINUTES
            ) < self::MAX_REQUESTS;
    }

    /** Makes the token, stores its hash and writes the email. */
    private static function issue(int $userId, string $email, string $role): void
    {
        // Asking for a new link retires the old one, so only the newest works.
        PasswordResetModel::invalidateForUser($userId);

        $token = bin2hex(random_bytes(32));
        PasswordResetModel::insert(
            $userId,
            hash('sha256', $token),
            self::TTL_MINUTES,
            self::clientIp()
        );

        $portal = self::PORTAL_LABELS[$role] ?? 'Equipify';
        $link   = self::resetUrl($token);

        Mailer::send(
            $email,
            'Reset your Equipify password',
            "Someone asked to reset the password for your Equipify {$portal} account.\n"
            . "\n"
            . "Open this link to choose a new one:\n"
            . "\n"
            . $link . "\n"
            . "\n"
            . 'The link stops working in ' . self::TTL_MINUTES . " minutes, and can only be used once.\n"
            . "\n"
            . "If this was not you, you can ignore this email. Your password has not changed.\n"
            . "\n"
            . "-- Equipify\n"
        );
    }

    /**
     * The token's row, or an ended request. One message for expired, spent,
     * unknown and malformed, because the difference is not the user's business
     * and telling them would help someone guessing tokens.
     *
     * @return array<string,mixed>
     */
    private static function findOr410(string $token): array
    {
        // 64 hex characters, as issue() makes them. Anything else cannot match
        // a stored hash, so do not bother the database with it.
        $reset = preg_match('/^[0-9a-f]{64}$/', $token) === 1
            ? PasswordResetModel::findValidByHash(hash('sha256', $token))
            : null;

        if ($reset === null) {
            self::linkDead();
        }
        return $reset;
    }

    /** 410 Gone: the link was real once, or never was. Either way, start again. */
    private static function linkDead(): void
    {
        Response::error(
            'This reset link has expired or has already been used. Please request a new one.',
            410
        );
    }

    /**
     * The absolute URL of the Reset Password page.
     *
     * Built from the request rather than configured, so it works on
     * localhost:8000, on XAMPP under /equipify, and anywhere else the project
     * is dropped. SCRIPT_NAME's folder is .../backend/api; the app root is
     * whatever sits in front of that.
     */
    private static function resetUrl(string $token): string
    {
        $scheme = empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off' ? 'http' : 'https';
        $host   = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');

        $base = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? ''))), '/');
        if (substr($base, -12) === '/backend/api') {
            $base = substr($base, 0, -12);
        }

        return $scheme . '://' . $host . $base
            . '/frontend/Account/Reset%20Password/index.html?token=' . $token;
    }

    /** Recorded for the audit trail only; never trusted for a decision. */
    private static function clientIp(): ?string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        return is_string($ip) && $ip !== '' ? substr($ip, 0, 45) : null;
    }
}
