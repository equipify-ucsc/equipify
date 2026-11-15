<?php
/**
 * SQL for the `area_managers` subtype table (1:0..1 on users.user_id).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class AreaManagerModel
{
    public static function operationalArea(int $managerId, bool $lock = false): array
    {
        $stmt = getDbConnection()->prepare("SELECT a.area_id, a.name AS area_name
            FROM area_managers am JOIN areas a ON a.area_id = am.area_id AND a.is_active = 1
            JOIN users u ON u.user_id = am.user_id AND u.role = 'area_manager' AND u.account_status = 'active'
            WHERE am.user_id = ?" . ($lock ? ' FOR UPDATE' : ''));
        $stmt->execute([$managerId]);
        $area = $stmt->fetch();
        if (!$area) throw new DomainException('An active assigned area is required. Contact an administrator.', 409);
        $area['area_id'] = (int) $area['area_id'];
        return $area;
    }
    private const SELECT = 'SELECT u.user_id, u.full_name, u.email, u.phone, u.district, u.account_status, u.created_at,
        am.area_id, a.name AS area_name FROM area_managers am JOIN users u ON u.user_id = am.user_id
        LEFT JOIN areas a ON a.area_id = am.area_id';

    public static function find(int $id): ?array
    {
        $stmt = getDbConnection()->prepare(self::SELECT . ' WHERE am.user_id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ? self::present($row) : null;
    }

    /** Only changes operational assignment, never registration or account data. */
    public static function assignArea(int $managerId, ?int $areaId): array
    {
        $db = getDbConnection();
        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) $db->beginTransaction();
        else $db->exec('SAVEPOINT manager_area');
        try {
            $stmt = $db->prepare('SELECT user_id, area_id FROM area_managers WHERE user_id = ? FOR UPDATE');
            $stmt->execute([$managerId]);
            $current = $stmt->fetch();
            if (!$current) throw new DomainException('Area manager not found.', 404);
            if (($current['area_id'] === null ? null : (int) $current['area_id']) !== $areaId) {
                $vehicles = $db->prepare('SELECT vehicle_id FROM vehicles WHERE managed_by = ? LIMIT 1 FOR UPDATE');
                $vehicles->execute([$managerId]);
                if ($vehicles->fetchColumn() !== false) {
                    throw new DomainException('This manager has vehicle records. An explicit fleet handover is required before changing or removing their area.', 409);
                }
            }
            if ($areaId !== null) {
                // Lock the area so validation and assignment cannot race a deactivation.
                $stmt = $db->prepare('SELECT is_active FROM areas WHERE area_id = ? FOR UPDATE');
                $stmt->execute([$areaId]);
                if ((int) $stmt->fetchColumn() !== 1) throw new DomainException('Select an existing active area.', 422);
            }
            $stmt = $db->prepare('UPDATE area_managers SET area_id = ? WHERE user_id = ?');
            $stmt->execute([$areaId, $managerId]);
            $manager = self::find($managerId);
            if ($ownsTransaction) $db->commit();
            else $db->exec('RELEASE SAVEPOINT manager_area');
            return $manager;
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                if ($ownsTransaction) $db->rollBack();
                else { $db->exec('ROLLBACK TO SAVEPOINT manager_area'); $db->exec('RELEASE SAVEPOINT manager_area'); }
            }
            throw $e;
        }
    }

    private static function present(array $row): array
    {
        $row['area_id'] = $row['area_id'] === null ? null : (int) $row['area_id'];
        return $row;
    }
    public static function insert(int $userId, int $registeredBy): void
    {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO area_managers (user_id, registered_by) VALUES (:user_id, :registered_by)'
        );
        $stmt->execute([':user_id' => $userId, ':registered_by' => $registeredBy]);
    }

    /**
     * The district the area manager covers, or null if the user is not an area
     * manager. Staff they register inherit it, since neither registration form
     * asks for a district.
     */
    public static function districtOf(int $userId): ?string
    {
        $stmt = getDbConnection()->prepare(
            'SELECT u.district
               FROM area_managers am
               JOIN users u ON u.user_id = am.user_id
              WHERE am.user_id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $district = $stmt->fetchColumn();
        return $district === false || $district === null ? null : (string) $district;
    }

    /** @return array<int,array<string,mixed>> */
    public static function all(): array
    {
        return array_map([self::class, 'present'], getDbConnection()->query(
            self::SELECT . ' ORDER BY u.created_at DESC, u.user_id DESC'
        )->fetchAll());
    }
}
