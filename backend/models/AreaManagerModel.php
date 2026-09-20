<?php
/**
 * SQL for the `area_managers` subtype table (1:0..1 on users.user_id).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class AreaManagerModel
{
    public static function insert(int $userId, int $registeredBy): void
    {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO area_managers (user_id, registered_by) VALUES (:user_id, :registered_by)'
        );
        $stmt->execute([':user_id' => $userId, ':registered_by' => $registeredBy]);
    }

    /** @return array<int,array<string,mixed>> */
    public static function all(): array
    {
        return getDbConnection()->query(
            'SELECT u.user_id, u.full_name, u.email, u.phone, u.district, u.account_status, u.created_at
               FROM area_managers am
               JOIN users u ON u.user_id = am.user_id
              ORDER BY u.created_at DESC'
        )->fetchAll();
    }
}
