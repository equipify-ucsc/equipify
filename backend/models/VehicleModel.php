<?php
/**
 * SQL for the `vehicles` table (an area manager's delivery fleet).
 *
 * Every query that touches one vehicle also filters on managed_by, so a guessed
 * vehicle_id can never reach another area manager's fleet.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class VehicleModel
{
    private const COLUMNS =
        'vehicle_id, plate_number, vehicle_type, max_load_kg, cargo_length_m,
         cargo_width_m, status, retired_at, created_at, updated_at';

    /**
     * The whole fleet of one area manager, retired vehicles included: active
     * first, then newest first.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function allForManager(int $managerId): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT ' . self::COLUMNS . '
               FROM vehicles
              WHERE managed_by = :manager_id
              ORDER BY retired_at IS NOT NULL, vehicle_id DESC'
        );
        $stmt->execute([':manager_id' => $managerId]);
        return $stmt->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public static function findForManager(int $vehicleId, int $managerId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT ' . self::COLUMNS . '
               FROM vehicles
              WHERE vehicle_id = :id AND managed_by = :manager_id'
        );
        $stmt->execute([':id' => $vehicleId, ':manager_id' => $managerId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Whether any vehicle on the platform (retired ones too) already has this
     * plate. $exceptId leaves out the vehicle being edited.
     */
    public static function plateExists(string $plate, ?int $exceptId = null): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM vehicles
              WHERE plate_number = :plate AND vehicle_id <> :except_id
              LIMIT 1'
        );
        $stmt->execute([':plate' => $plate, ':except_id' => $exceptId ?? 0]);
        return $stmt->fetchColumn() !== false;
    }

    /** Whether this plate belongs to one of this manager's retired vehicles. */
    public static function plateIsRetiredForManager(string $plate, int $managerId): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM vehicles
              WHERE plate_number = :plate AND managed_by = :manager_id
                AND retired_at IS NOT NULL
              LIMIT 1'
        );
        $stmt->execute([':plate' => $plate, ':manager_id' => $managerId]);
        return $stmt->fetchColumn() !== false;
    }

    /**
     * @param array{plate_number:string,vehicle_type:string,max_load_kg:int,
     *              cargo_length_m:string,cargo_width_m:string,status:string} $v
     * @return int the new vehicle_id
     */
    public static function insert(int $managerId, array $v): int
    {
        $db   = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO vehicles
                 (managed_by, plate_number, vehicle_type, max_load_kg,
                  cargo_length_m, cargo_width_m, status)
             VALUES (:manager_id, :plate, :type, :max_load,
                     :length, :width, :status)'
        );
        $stmt->execute([
            ':manager_id' => $managerId,
            ':plate'      => $v['plate_number'],
            ':type'       => $v['vehicle_type'],
            ':max_load'   => $v['max_load_kg'],
            ':length'     => $v['cargo_length_m'],
            ':width'      => $v['cargo_width_m'],
            ':status'     => $v['status'],
        ]);
        return (int) $db->lastInsertId();
    }

    /**
     * Updates an active vehicle. Retired vehicles are left untouched.
     *
     * @param array{plate_number:string,vehicle_type:string,max_load_kg:int,
     *              cargo_length_m:string,cargo_width_m:string,status:string} $v
     * @return bool false when no active vehicle of this manager has that id
     */
    public static function update(int $vehicleId, int $managerId, array $v): bool
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE vehicles
                SET plate_number   = :plate,
                    vehicle_type   = :type,
                    max_load_kg    = :max_load,
                    cargo_length_m = :length,
                    cargo_width_m  = :width,
                    status         = :status
              WHERE vehicle_id = :id AND managed_by = :manager_id
                AND retired_at IS NULL'
        );
        $stmt->execute([
            ':plate'      => $v['plate_number'],
            ':type'       => $v['vehicle_type'],
            ':max_load'   => $v['max_load_kg'],
            ':length'     => $v['cargo_length_m'],
            ':width'      => $v['cargo_width_m'],
            ':status'     => $v['status'],
            ':id'         => $vehicleId,
            ':manager_id' => $managerId,
        ]);
        // rowCount() is 0 for a matched row whose values didn't change, so
        // report existence rather than "something changed".
        return $stmt->rowCount() === 1 || self::isActive($vehicleId, $managerId);
    }

    /**
     * Hard-deletes a vehicle. A PDOException (MySQL error 1451) escapes when
     * delivery history still references it; the caller decides what to do.
     *
     * @return bool false when the id isn't this manager's
     */
    public static function delete(int $vehicleId, int $managerId): bool
    {
        $stmt = getDbConnection()->prepare(
            'DELETE FROM vehicles WHERE vehicle_id = :id AND managed_by = :manager_id'
        );
        $stmt->execute([':id' => $vehicleId, ':manager_id' => $managerId]);
        return $stmt->rowCount() === 1;
    }

    /** Takes a vehicle out of the active fleet but keeps the row for history. */
    public static function retire(int $vehicleId, int $managerId): bool
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE vehicles SET retired_at = CURRENT_TIMESTAMP
              WHERE vehicle_id = :id AND managed_by = :manager_id
                AND retired_at IS NULL'
        );
        $stmt->execute([':id' => $vehicleId, ':manager_id' => $managerId]);
        return $stmt->rowCount() === 1;
    }

    /** Brings a retired vehicle back into the fleet as available. */
    public static function restore(int $vehicleId, int $managerId): bool
    {
        $stmt = getDbConnection()->prepare(
            "UPDATE vehicles SET retired_at = NULL, status = 'available'
              WHERE vehicle_id = :id AND managed_by = :manager_id
                AND retired_at IS NOT NULL"
        );
        $stmt->execute([':id' => $vehicleId, ':manager_id' => $managerId]);
        return $stmt->rowCount() === 1;
    }

    private static function isActive(int $vehicleId, int $managerId): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM vehicles
              WHERE vehicle_id = :id AND managed_by = :manager_id
                AND retired_at IS NULL'
        );
        $stmt->execute([':id' => $vehicleId, ':manager_id' => $managerId]);
        return $stmt->fetchColumn() !== false;
    }
}
