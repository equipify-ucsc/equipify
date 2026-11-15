<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/AreaManagerModel.php';

final class VehicleModel
{
    // Vehicle area follows its custodian. AreaManagerModel prevents implicit fleet moves.
    private const SCOPE = " FROM vehicles v
        JOIN area_managers owner ON owner.user_id = v.managed_by
        JOIN area_managers actor ON actor.area_id = owner.area_id AND actor.user_id = :manager_id
        JOIN areas a ON a.area_id = actor.area_id AND a.is_active = 1
        JOIN users acting_user ON acting_user.user_id = actor.user_id
            AND acting_user.role = 'area_manager' AND acting_user.account_status = 'active'";
    private const SELECT = 'SELECT v.*, a.area_id, a.name AS area_name';

    public static function allForManager(int $managerId): array
    {
        $stmt = getDbConnection()->prepare(self::SELECT . self::SCOPE . ' ORDER BY v.retired_at IS NOT NULL, v.vehicle_id DESC');
        $stmt->execute([':manager_id' => $managerId]);
        return $stmt->fetchAll();
    }

    public static function findForManager(int $vehicleId, int $managerId): ?array
    {
        $stmt = getDbConnection()->prepare(self::SELECT . self::SCOPE . ' WHERE v.vehicle_id = :id');
        $stmt->execute([':id' => $vehicleId, ':manager_id' => $managerId]);
        return $stmt->fetch() ?: null;
    }

    public static function plateExists(string $plate, ?int $exceptId = null): bool
    {
        $stmt = getDbConnection()->prepare('SELECT 1 FROM vehicles WHERE plate_number = ? AND vehicle_id <> ? LIMIT 1');
        $stmt->execute([$plate, $exceptId ?? 0]);
        return $stmt->fetchColumn() !== false;
    }

    public static function plateIsRetiredForManager(string $plate, int $managerId): bool
    {
        $stmt = getDbConnection()->prepare('SELECT 1' . self::SCOPE . ' WHERE v.plate_number = :plate AND v.retired_at IS NOT NULL LIMIT 1');
        $stmt->execute([':plate' => $plate, ':manager_id' => $managerId]);
        return $stmt->fetchColumn() !== false;
    }

    public static function insert(int $managerId, array $v): int
    {
        return self::transaction(static function (PDO $db) use ($managerId, $v): int {
            AreaManagerModel::operationalArea($managerId, true);
            $stmt = $db->prepare('INSERT INTO vehicles (managed_by, plate_number, vehicle_type, max_load_kg, cargo_length_m, cargo_width_m, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$managerId, $v['plate_number'], $v['vehicle_type'], $v['max_load_kg'], $v['cargo_length_m'], $v['cargo_width_m'], $v['status']]);
            return (int) $db->lastInsertId();
        });
    }

    public static function update(int $vehicleId, int $managerId, array $v): bool
    {
        return self::operate($vehicleId, $managerId, static function (PDO $db, array $row) use ($v): bool {
            if ($row['retired_at'] !== null) return false;
            if ($row['status'] === 'in_use' && $v['status'] !== 'in_use') throw new DomainException('An active delivery controls this vehicle status.', 409);
            $stmt = $db->prepare('UPDATE vehicles SET plate_number = ?, vehicle_type = ?, max_load_kg = ?, cargo_length_m = ?, cargo_width_m = ?, status = ? WHERE vehicle_id = ?');
            $stmt->execute([$v['plate_number'], $v['vehicle_type'], $v['max_load_kg'], $v['cargo_length_m'], $v['cargo_width_m'], $v['status'], $row['vehicle_id']]);
            return true;
        });
    }

    // Removal is reversible: retain every vehicle row and its registration/history.
    public static function delete(int $vehicleId, int $managerId): bool { return self::retire($vehicleId, $managerId); }

    public static function retire(int $vehicleId, int $managerId): bool
    {
        return self::operate($vehicleId, $managerId, static function (PDO $db, array $row): bool {
            if ($row['retired_at'] !== null) return false;
            if ($row['status'] === 'in_use') throw new DomainException('This vehicle is on an active delivery and cannot be removed.', 409);
            $stmt = $db->prepare('UPDATE vehicles SET retired_at = CURRENT_TIMESTAMP WHERE vehicle_id = ?');
            $stmt->execute([$row['vehicle_id']]);
            return true;
        });
    }

    public static function restore(int $vehicleId, int $managerId): bool
    {
        return self::operate($vehicleId, $managerId, static function (PDO $db, array $row): bool {
            if ($row['retired_at'] === null) return false;
            if ($row['status'] === 'in_use') throw new DomainException('An active delivery controls this vehicle status.', 409);
            $stmt = $db->prepare("UPDATE vehicles SET retired_at = NULL, status = 'available' WHERE vehicle_id = ?");
            $stmt->execute([$row['vehicle_id']]);
            return true;
        });
    }

    private static function operate(int $vehicleId, int $managerId, callable $action): bool
    {
        return self::transaction(static function (PDO $db) use ($vehicleId, $managerId, $action): bool {
            $stmt = $db->prepare(self::SELECT . self::SCOPE . ' WHERE v.vehicle_id = :id FOR UPDATE');
            $stmt->execute([':id' => $vehicleId, ':manager_id' => $managerId]);
            $row = $stmt->fetch();
            return $row ? $action($db, $row) : false;
        });
    }

    private static function transaction(callable $action)
    {
        $db = getDbConnection();
        $owns = !$db->inTransaction();
        if ($owns) $db->beginTransaction(); else $db->exec('SAVEPOINT vehicle_operation');
        try {
            $result = $action($db);
            if ($owns) $db->commit(); else $db->exec('RELEASE SAVEPOINT vehicle_operation');
            return $result;
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                if ($owns) $db->rollBack();
                else { $db->exec('ROLLBACK TO SAVEPOINT vehicle_operation'); $db->exec('RELEASE SAVEPOINT vehicle_operation'); }
            }
            throw $e;
        }
    }
}
