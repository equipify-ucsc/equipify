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
                 (user_id, registered_by, area_id, specialization, years_experience)
             SELECT :user_id, am.user_id, a.area_id, :specialization, :years_experience
             FROM area_managers am JOIN areas a ON a.area_id = am.area_id AND a.is_active = 1
             JOIN users actor ON actor.user_id = am.user_id AND actor.account_status = \'active\' AND actor.role = \'area_manager\'
             WHERE am.user_id = :registered_by'
        );
        $stmt->execute([
            ':user_id'          => $userId,
            ':registered_by'    => $registeredBy,
            ':specialization'   => $t['specialization'],
            ':years_experience' => $t['years_experience'],
        ]);
        if ($stmt->rowCount() !== 1) throw new DomainException('An active assigned area is required.', 409);
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
                    mt.specialization, mt.years_experience, mt.availability_status,
                    u.account_status, u.created_at
               FROM maintenance_techs mt
               JOIN users u ON u.user_id = mt.user_id
               JOIN areas a ON a.area_id = mt.area_id AND a.is_active = 1
               JOIN area_managers am ON am.area_id = a.area_id
               JOIN users actor ON actor.user_id = am.user_id AND actor.account_status = \'active\'
              WHERE am.user_id = :manager_id' . ($userId === null ? '' : ' AND mt.user_id = :user_id') . '
              ORDER BY u.created_at DESC, u.user_id DESC'
        );
        $stmt->execute($userId === null ? [':manager_id' => $areaManagerId] : [':manager_id' => $areaManagerId, ':user_id' => $userId]);
        return $stmt->fetchAll();
    }
}
