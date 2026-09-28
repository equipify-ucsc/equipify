<?php
/**
 * SQL for the `password_resets` table: the short-lived tokens behind the
 * "forgot password" emails. Only place that reads or writes it.
 *
 * Every lookup is by the SHA-256 of the token, never the token itself -- the
 * raw value exists only in the email.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class PasswordResetModel
{
    public static function insert(int $userId, string $tokenHash, int $ttlMinutes, ?string $ip): int
    {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO password_resets (user_id, token_hash, expires_at, requested_ip)
             VALUES (:user_id, :token_hash, DATE_ADD(NOW(), INTERVAL :ttl MINUTE), :ip)'
        );
        $stmt->execute([
            ':user_id'    => $userId,
            ':token_hash' => $tokenHash,
            ':ttl'        => $ttlMinutes,
            ':ip'         => $ip,
        ]);
        return (int) getDbConnection()->lastInsertId();
    }

    /**
     * The unused, unexpired token with this hash, together with the account it
     * belongs to. The account_status check lives here rather than in the
     * controller so a token cannot outlive a suspension.
     *
     * @return array<string,mixed>|null
     */
    public static function findValidByHash(string $tokenHash): ?array
    {
        $stmt = getDbConnection()->prepare(
            "SELECT r.reset_id, r.user_id, r.expires_at,
                    u.email, u.role, u.full_name
               FROM password_resets r
               JOIN users u ON u.user_id = r.user_id
              WHERE r.token_hash = :token_hash
                AND r.used_at IS NULL
                AND r.expires_at > NOW()
                AND u.account_status = 'active'
              LIMIT 1"
        );
        $stmt->execute([':token_hash' => $tokenHash]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** Spends one token. Guarded on used_at so a double submit cannot reuse it. */
    public static function markUsed(int $resetId): bool
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE password_resets SET used_at = NOW()
              WHERE reset_id = :id AND used_at IS NULL'
        );
        $stmt->execute([':id' => $resetId]);
        return $stmt->rowCount() === 1;
    }

    /**
     * Kills every outstanding link for one account. Called when a new one is
     * requested and again once a reset completes, so only the newest link ever
     * works and none survive the password change.
     */
    public static function invalidateForUser(int $userId): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE password_resets SET used_at = NOW()
              WHERE user_id = :user_id AND used_at IS NULL'
        );
        $stmt->execute([':user_id' => $userId]);
    }

    /** How many links this account has asked for in the last N minutes. */
    public static function recentCountForUser(int $userId, int $withinMinutes): int
    {
        $stmt = getDbConnection()->prepare(
            'SELECT COUNT(*) FROM password_resets
              WHERE user_id = :user_id
                AND created_at > DATE_SUB(NOW(), INTERVAL :mins MINUTE)'
        );
        $stmt->execute([':user_id' => $userId, ':mins' => $withinMinutes]);
        return (int) $stmt->fetchColumn();
    }
}
