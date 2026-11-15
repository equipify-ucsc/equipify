<?php
/**
 * SQL for the `delivery_personnel` subtype table (1:0..1 on users.user_id).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class DeliveryPersonnelModel
{
    /**
     * Inserts the subtype row. Does not manage a transaction: the caller (a
     * service) wraps this with the `users` insert.
     *
     * @param array{driving_license_no:string,license_class:string,license_expiry:string} $d
     */
    public static function insert(int $userId, int $registeredBy, array $d): void
    {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO delivery_personnel
                 (user_id, registered_by, area_id, driving_license_no, license_class, license_expiry)
             SELECT :user_id, am.user_id, a.area_id, :license_no, :license_class, :license_expiry
             FROM area_managers am JOIN areas a ON a.area_id = am.area_id AND a.is_active = 1
             JOIN users actor ON actor.user_id = am.user_id AND actor.account_status = \'active\' AND actor.role = \'area_manager\'
             WHERE am.user_id = :registered_by'
        );
        $stmt->execute([
            ':user_id'        => $userId,
            ':registered_by'  => $registeredBy,
            ':license_no'     => $d['driving_license_no'],
            ':license_class'  => $d['license_class'],
            ':license_expiry' => $d['license_expiry'],
        ]);
        if ($stmt->rowCount() !== 1) throw new DomainException('An active assigned area is required.', 409);
    }

    public static function licenseExists(string $licenseNo): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM delivery_personnel WHERE driving_license_no = :no LIMIT 1'
        );
        $stmt->execute([':no' => $licenseNo]);
        return $stmt->fetchColumn() !== false;
    }

    /**
     * Shared roster for the manager's current active area; unassigned staff
     * are excluded without falling back to registration ownership.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function findForManager(int $userId, int $managerId): ?array
    {
        return self::allForManager($managerId, $userId)[0] ?? null;
    }

    public static function allForManager(int $areaManagerId, ?int $userId = null): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT u.user_id, u.full_name, u.email, u.phone, u.district, a.area_id, a.name AS area_name,
                    dp.driving_license_no, dp.license_class, dp.license_expiry,
                    dp.availability_status, u.account_status, u.created_at
               FROM delivery_personnel dp
               JOIN users u ON u.user_id = dp.user_id
               JOIN areas a ON a.area_id = dp.area_id AND a.is_active = 1
               JOIN area_managers am ON am.area_id = a.area_id
               JOIN users actor ON actor.user_id = am.user_id AND actor.account_status = \'active\'
              WHERE am.user_id = :manager_id' . ($userId === null ? '' : ' AND dp.user_id = :user_id') . '
              ORDER BY u.created_at DESC, u.user_id DESC'
        );
        $stmt->execute($userId === null ? [':manager_id' => $areaManagerId] : [':manager_id' => $areaManagerId, ':user_id' => $userId]);
        return $stmt->fetchAll();
    }
}
