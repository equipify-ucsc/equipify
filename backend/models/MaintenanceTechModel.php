<?php
/**
 * SQL for the `maintenance_techs` subtype table (1:0..1 on users.user_id).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class MaintenanceTechModel
{
    /**
     * Inserts the subtype row. Does not manage a transaction: the caller (a
     * service) wraps this with the `users` insert.
     *
     * @param array{specialization:string,years_experience:?int} $t
     */
    public static function insert(int $userId, int $registeredBy, array $t): void
    {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO maintenance_techs
                 (user_id, registered_by, specialization, years_experience)
             VALUES (:user_id, :registered_by, :specialization, :years_experience)'
        );
        $stmt->execute([
            ':user_id'          => $userId,
            ':registered_by'    => $registeredBy,
            ':specialization'   => $t['specialization'],
            ':years_experience' => $t['years_experience'],
        ]);
    }

    /**
     * The roster of one area manager only — an area manager never sees another
     * region's technicians.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function allForManager(int $areaManagerId): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT u.user_id, u.full_name, u.email, u.phone, u.district,
                    mt.specialization, mt.years_experience, mt.availability_status,
                    u.account_status, u.created_at
               FROM maintenance_techs mt
               JOIN users u ON u.user_id = mt.user_id
              WHERE mt.registered_by = :manager_id
              ORDER BY u.created_at DESC'
        );
        $stmt->execute([':manager_id' => $areaManagerId]);
        return $stmt->fetchAll();
    }
}
