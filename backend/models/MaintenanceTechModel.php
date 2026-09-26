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
     * Records which equipment categories the technician services. Does not
     * manage a transaction: the registration service wraps it.
     *
     * @param int[] $categoryIds
     */
    public static function insertCategories(int $userId, array $categoryIds): void
    {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO maintenance_tech_categories (user_id, category_id)
             VALUES (:user_id, :category_id)'
        );
        foreach ($categoryIds as $categoryId) {
            $stmt->execute([':user_id' => $userId, ':category_id' => $categoryId]);
        }
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

    /** The subtype row for a profile page (the `users` part comes from UserModel::findAccount). */
    public static function findDetails(int $userId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT bio, years_experience, specialization, availability_status
               FROM maintenance_techs WHERE user_id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @param array{bio:?string,years_experience:?int,specialization:?string} $t */
    public static function updateDetails(int $userId, array $t): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE maintenance_techs
                SET bio = :bio, years_experience = :years_experience, specialization = :specialization
              WHERE user_id = :id'
        );
        $stmt->execute([
            ':bio'              => $t['bio'],
            ':years_experience' => $t['years_experience'],
            ':specialization'   => $t['specialization'],
            ':id'               => $userId,
        ]);
    }
}
