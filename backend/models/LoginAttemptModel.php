<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/db_config.php';

final class LoginAttemptModel
{
    public static function blocked(string $identifier, ?string $ip): bool
    {
        $stmt = getDbConnection()->prepare("SELECT
            SUM(identifier = ?) AS account_failures,
            SUM(request_ip = ?) AS ip_failures
            FROM login_attempts WHERE succeeded = 0
            AND attempted_at > CURRENT_TIMESTAMP - INTERVAL 15 MINUTE
            AND (identifier = ? OR request_ip = ?)");
        $stmt->execute([$identifier, $ip, $identifier, $ip]);
        $row = $stmt->fetch();
        return (int) $row['account_failures'] >= 5 || (int) $row['ip_failures'] >= 30;
    }

    public static function record(string $identifier, ?int $userId, bool $success, ?string $ip, ?string $reason): void
    {
        $stmt = getDbConnection()->prepare('INSERT INTO login_attempts
            (identifier, user_id, succeeded, request_ip, failure_reason) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$identifier, $userId, (int) $success, $ip, $reason]);
    }
}
