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
                 (user_id, registered_by, driving_license_no, license_class, license_expiry)
             VALUES (:user_id, :registered_by, :license_no, :license_class, :license_expiry)'
        );
        $stmt->execute([
            ':user_id'        => $userId,
            ':registered_by'  => $registeredBy,
            ':license_no'     => $d['driving_license_no'],
            ':license_class'  => $d['license_class'],
            ':license_expiry' => $d['license_expiry'],
        ]);
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
     * The roster of one area manager only — an area manager never sees another
     * region's personnel.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function allForManager(int $areaManagerId): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT u.user_id, u.full_name, u.email, u.phone, u.district,
                    dp.driving_license_no, dp.license_class, dp.license_expiry,
                    dp.availability_status, u.account_status, u.created_at
               FROM delivery_personnel dp
               JOIN users u ON u.user_id = dp.user_id
              WHERE dp.registered_by = :manager_id
              ORDER BY u.created_at DESC'
        );
        $stmt->execute([':manager_id' => $areaManagerId]);
        return $stmt->fetchAll();
    }
}
