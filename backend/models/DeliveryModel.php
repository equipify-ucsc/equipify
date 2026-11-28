<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/AreaManagerModel.php';
require_once __DIR__ . '/../services/NotificationService.php';

final class DeliveryModel
{
    /** Reserved integration boundary. Never trusts caller-supplied payment/address data. */
    public static function createFromRental(int $rentalId): array
    {
        if ($rentalId < 1) return ['status' => 'invalid', 'created' => []];
        // No rentals/payment schema exists in this checkout. Fail closed rather
        // than inventing paid states, assigning a manager or persisting unverified data.
        throw new LogicException('Rental payment and logistics persistence is not available; delivery creation is blocked.');
    }

    public static function listing(int $areaId, int $page, int $perPage, string $status = ''): array
    {
        $ready = self::assignmentSupported();
        $perPage = max(1, min(50, $perPage));
        $where = 'd.area_id = ?' . ($status === '' ? '' : ' AND d.status = ?');
        $args = $status === '' ? [$areaId] : [$areaId, $status];
        $db = getDbConnection();
        $stmt = $db->prepare('SELECT COUNT(*) FROM deliveries d WHERE ' . $where);
        $stmt->execute($args);
        $total = (int) $stmt->fetchColumn();
        $page = max(1, min($page, max(1, (int) ceil($total / $perPage))));
        $stmt = $db->prepare('SELECT d.delivery_id, d.related_reference, d.pickup_address, d.delivery_address,
            d.scheduled_at, d.status, d.created_at, d.delivery_personnel_id, d.vehicle_id,
            personnel.full_name AS delivery_personnel_name, v.plate_number AS vehicle_plate, v.vehicle_type, ' .
            ($ready ? 'd.scheduled_end_at, d.assignment_version' : 'NULL AS scheduled_end_at, 0 AS assignment_version') .
            ' FROM deliveries d LEFT JOIN users personnel ON personnel.user_id = d.delivery_personnel_id LEFT JOIN vehicles v ON v.vehicle_id = d.vehicle_id WHERE ' . $where .
            ' ORDER BY d.created_at DESC, d.delivery_id DESC LIMIT ' . $perPage . ' OFFSET ' . (($page - 1) * $perPage));
        $stmt->execute($args);
        return ['items' => $stmt->fetchAll(), 'page' => $page, 'per_page' => $perPage,
            'total' => $total, 'total_pages' => (int) ceil($total / $perPage), 'assignment_supported' => $ready,
            'server_time' => (new DateTimeImmutable('now',new DateTimeZone('Asia/Colombo')))->format(DateTimeInterface::ATOM),
            'timezone' => 'Asia/Colombo'];
    }

    /** Keep Week 1–3 listing usable before the separately applied extension. */
    public static function assignmentSupported(): bool
    {
        $columns = getDbConnection()->query("SHOW COLUMNS FROM deliveries WHERE Field IN ('scheduled_end_at', 'assignment_version')")->fetchAll();
        return count($columns) === 2;
    }

    private static function requireAssignmentSchema(): void
    {
        if (!self::assignmentSupported()) throw new DomainException('The Week 4 assignment schema extension is not installed.', 409);
    }

    /** Explicit Sri Lankan local times; no guessed duration or timezone conversion. */
    public static function scheduleWindow(string $start, string $end): array
    {
        $zone = new DateTimeZone('Asia/Colombo');
        $dates = [];
        foreach ([$start, $end] as $value) {
            $date = false;
            foreach (['Y-m-d H:i:s', 'Y-m-d\TH:i', 'Y-m-d\TH:i:s'] as $format) {
                $candidate = DateTimeImmutable::createFromFormat('!' . $format, $value, $zone);
                if ($candidate !== false && $candidate->format($format) === $value) { $date = $candidate; break; }
            }
            if ($date === false) throw new DomainException('Provide valid start and end times in Sri Lanka time.', 422);
            $dates[] = $date;
        }
        if ($dates[0] <= new DateTimeImmutable('now', $zone) || $dates[1] <= $dates[0]) {
            throw new DomainException('Schedule a future start and an end after the start.', 422);
        }
        return [$dates[0]->format('Y-m-d H:i:s'), $dates[1]->format('Y-m-d H:i:s')];
    }

    private static function deliveryForArea(int $id, int $areaId, bool $lock = false): array
    {
        $stmt = getDbConnection()->prepare('SELECT * FROM deliveries WHERE delivery_id = ? AND area_id = ?' . ($lock ? ' FOR UPDATE' : ''));
        $stmt->execute([$id, $areaId]);
        $row = $stmt->fetch();
        if (!$row) throw new DomainException('Delivery not found.', 404);
        return $row;
    }

    private static function assertEditable(array $delivery): void
    {
        if (!in_array($delivery['status'], ['pending', 'assigned'], true)) {
            throw new DomainException('Only pending or assigned deliveries can be changed.', 409);
        }
    }

    private static function licenseThrough(string $end): string
    {
        return (new DateTimeImmutable($end, new DateTimeZone('Asia/Colombo')))->modify('-1 second')->format('Y-m-d');
    }

    public static function availablePersonnel(int $managerId, int $deliveryId, string $start, string $end): array
    {
        self::requireAssignmentSchema();
        $area = AreaManagerModel::operationalArea($managerId);
        $delivery = self::deliveryForArea($deliveryId, $area['area_id']);
        self::assertEditable($delivery);
        [$start, $end] = self::scheduleWindow($start, $end);
        $stmt = getDbConnection()->prepare("SELECT dp.user_id, u.full_name, dp.license_class, dp.license_expiry
            FROM delivery_personnel dp JOIN users u ON u.user_id = dp.user_id
            WHERE dp.area_id = ? AND dp.availability_status = 'available'
            AND u.role = 'delivery_personnel' AND u.account_status = 'active' AND dp.license_expiry >= ?
            AND NOT EXISTS (SELECT 1 FROM deliveries booked WHERE booked.delivery_personnel_id = dp.user_id
                AND booked.delivery_id <> ? AND booked.status IN ('pending','assigned','in_transit')
                AND (booked.status = 'in_transit' OR booked.scheduled_at IS NULL OR booked.scheduled_end_at IS NULL
                    OR (booked.scheduled_at < ? AND booked.scheduled_end_at > ?)))
            ORDER BY u.full_name, dp.user_id");
        $stmt->execute([$area['area_id'], self::licenseThrough($end), $deliveryId, $end, $start]);
        return ['items' => $stmt->fetchAll(), 'scheduled_at' => $start, 'scheduled_end_at' => $end];
    }

    /** Area, delivery and personnel locks serialize conflicting reservations. */
    public static function assignPersonnel(int $managerId, int $deliveryId, int $personnelId, string $start, string $end, int $expectedVersion, ?int $vehicleId = null): array
    {
        self::requireAssignmentSchema();
        if ($deliveryId < 1 || $personnelId < 1 || $expectedVersion < 0 || ($vehicleId !== null && $vehicleId < 1)) throw new DomainException('Invalid assignment identifiers.', 422);
        [$start, $end] = self::scheduleWindow($start, $end);
        return self::transaction(static function (PDO $db) use ($managerId, $deliveryId, $personnelId, $start, $end, $expectedVersion, $vehicleId): array {
            $area = AreaManagerModel::operationalArea($managerId, true);
            $delivery = self::deliveryForArea($deliveryId, $area['area_id'], true);
            self::assertEditable($delivery);
            self::assertVersion($delivery, $expectedVersion);
            $oldId = $delivery['delivery_personnel_id'] === null ? null : (int) $delivery['delivery_personnel_id'];
            self::lockPersonnelUsers($oldId, $personnelId);
            // Lock waits must not allow a formerly future start to pass unnoticed.
            self::scheduleWindow($start, $end);
            $stmt = $db->prepare("SELECT dp.*, u.account_status, u.role FROM delivery_personnel dp
                JOIN users u ON u.user_id = dp.user_id WHERE dp.user_id = ? AND dp.area_id = ? FOR UPDATE");
            $stmt->execute([$personnelId, $area['area_id']]);
            $personnel = $stmt->fetch();
            if (!$personnel) throw new DomainException('Delivery personnel not found in your area.', 404);
            if ($personnel['role'] !== 'delivery_personnel' || $personnel['account_status'] !== 'active'
                || $personnel['availability_status'] !== 'available' || $personnel['license_expiry'] < self::licenseThrough($end)) {
                throw new DomainException('This person is not available or licensed for the complete scheduled window.', 409);
            }
            // A locking/current read sees reservations committed while waiting.
            $stmt = $db->prepare("SELECT delivery_id FROM deliveries WHERE delivery_personnel_id = ?
                AND delivery_id <> ? AND status IN ('pending','assigned','in_transit')
                AND (status = 'in_transit' OR scheduled_at IS NULL OR scheduled_end_at IS NULL
                    OR (scheduled_at < ? AND scheduled_end_at > ?)) LIMIT 1 FOR UPDATE");
            $stmt->execute([$personnelId, $deliveryId, $end, $start]);
            if ($stmt->fetchColumn() !== false) throw new DomainException('This person has an overlapping or unresolved delivery assignment.', 409);
            $oldVehicle = $delivery['vehicle_id'] === null ? null : (int) $delivery['vehicle_id'];
            self::lockVehicles($oldVehicle, $vehicleId);
            if ($vehicleId !== null) self::validateVehicle($vehicleId, $area['area_id'], $deliveryId, $start, $end);
            self::scheduleWindow($start, $end);
            $status = $vehicleId === null ? 'pending' : 'assigned';
            if ($oldId === $personnelId && $oldVehicle === $vehicleId && $delivery['status'] === $status && $delivery['scheduled_at'] === $start && $delivery['scheduled_end_at'] === $end) {
                self::syncVehicles($oldVehicle, $vehicleId);
                return ['changed' => false, 'delivery' => $delivery];
            }
            $stmt = $db->prepare("UPDATE deliveries SET delivery_personnel_id = ?, scheduled_at = ?, scheduled_end_at = ?,
                assigned_by = ?, vehicle_id = ?, status = ?, assignment_version = assignment_version + 1 WHERE delivery_id = ?");
            $stmt->execute([$personnelId, $start, $end, $managerId, $vehicleId, $status, $deliveryId]);
            self::syncVehicles($oldVehicle, $vehicleId);
            $action = $oldId === null ? 'Personnel reserved' : ($oldId === $personnelId ? 'Personnel schedule changed' : 'Personnel reassigned');
            if ($oldId === $personnelId && $oldVehicle !== $vehicleId) $action = 'Delivery vehicle changed';
            self::audit($delivery, $managerId, $status, $action . '; vehicle ' . ($oldVehicle ?? 'none') . ' -> ' . ($vehicleId ?? 'none') . '.');
            $context = 'Delivery #' . $deliveryId . ' is scheduled for ' . $start . ' to ' . $end . ' (Sri Lanka time). ' . ($vehicleId === null ? 'Vehicle confirmation is pending.' : 'Vehicle #' . $vehicleId . ' reserved; delivery assigned.');
            NotificationService::notify($personnelId, 'delivery', $action, $context);
            if ($oldId !== null && $oldId !== $personnelId) {
                NotificationService::notify($oldId, 'delivery', 'Delivery reassigned', 'You are no longer assigned to delivery #' . $deliveryId . '.');
            }
            return ['changed' => true, 'delivery' => self::deliveryForArea($deliveryId, $area['area_id'])];
        });
    }

    public static function cancel(int $managerId, int $deliveryId, int $expectedVersion, string $reason): array
    {
        self::requireAssignmentSchema();
        $reason = trim($reason);
        if ($deliveryId < 1 || $expectedVersion < 0 || $reason === '' || mb_strlen($reason) > 500 || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $reason)) {
            throw new DomainException('Provide valid identifiers and a cancellation reason of up to 500 characters.', 422);
        }
        return self::transaction(static function (PDO $db) use ($managerId, $deliveryId, $expectedVersion, $reason): array {
            $area = AreaManagerModel::operationalArea($managerId, true);
            $delivery = self::deliveryForArea($deliveryId, $area['area_id'], true);
            self::assertVersion($delivery, $expectedVersion);
            if ($delivery['status'] === 'cancelled') return ['changed' => false, 'delivery' => $delivery];
            self::assertEditable($delivery);
            $oldId = $delivery['delivery_personnel_id'] === null ? null : (int) $delivery['delivery_personnel_id'];
            self::lockPersonnelUsers($oldId, null);
            $vehicle = $delivery['vehicle_id'] === null ? null : (int) $delivery['vehicle_id'];
            self::lockVehicles($vehicle, null);
            $stmt = $db->prepare("UPDATE deliveries SET status = 'cancelled', assignment_version = assignment_version + 1 WHERE delivery_id = ?");
            $stmt->execute([$deliveryId]);
            self::syncVehicles($vehicle, null);
            // Keep resource FKs for history; terminal state releases driver time.
            self::audit($delivery, $managerId, 'cancelled', 'Cancelled: ' . $reason);
            if ($oldId !== null) NotificationService::notify($oldId, 'delivery', 'Delivery cancelled', 'Delivery #' . $deliveryId . ' was cancelled: ' . $reason);
            return ['changed' => true, 'delivery' => self::deliveryForArea($deliveryId, $area['area_id'])];
        });
    }

    public static function availableVehicles(int $managerId, int $deliveryId, string $start, string $end): array
    {
        self::requireAssignmentSchema();
        $area = AreaManagerModel::operationalArea($managerId);
        self::assertEditable(self::deliveryForArea($deliveryId, $area['area_id']));
        [$start, $end] = self::scheduleWindow($start, $end);
        $stmt = getDbConnection()->prepare("SELECT v.vehicle_id, v.plate_number, v.vehicle_type, v.max_load_kg, v.cargo_length_m, v.cargo_width_m
            FROM vehicles v JOIN area_managers owner ON owner.user_id = v.managed_by
            WHERE owner.area_id = ? AND v.retired_at IS NULL AND v.status <> 'maintenance'
            AND (v.status = 'available' OR EXISTS (SELECT 1 FROM deliveries held WHERE held.vehicle_id = v.vehicle_id
                AND held.status IN ('pending','assigned','in_transit')))
            AND NOT EXISTS (SELECT 1 FROM deliveries booked WHERE booked.vehicle_id = v.vehicle_id AND booked.delivery_id <> ?
                AND booked.status IN ('pending','assigned','in_transit') AND (booked.status = 'in_transit'
                    OR booked.scheduled_at IS NULL OR booked.scheduled_end_at IS NULL
                    OR (booked.scheduled_at < ? AND booked.scheduled_end_at > ?))) ORDER BY v.plate_number, v.vehicle_id");
        $stmt->execute([$area['area_id'], $deliveryId, $end, $start]);
        return ['items' => $stmt->fetchAll(), 'scheduled_at' => $start, 'scheduled_end_at' => $end];
    }

    private static function lockVehicles(?int $old, ?int $next): void
    {
        $ids = array_values(array_unique(array_filter([$old, $next], static fn($id) => $id !== null)));
        sort($ids, SORT_NUMERIC);
        $stmt = getDbConnection()->prepare('SELECT vehicle_id FROM vehicles WHERE vehicle_id = ? FOR UPDATE');
        foreach ($ids as $id) $stmt->execute([$id]);
    }

    private static function validateVehicle(int $id, int $area, int $delivery, string $start, string $end): void
    {
        $db = getDbConnection();
        $stmt = $db->prepare('SELECT v.* FROM vehicles v JOIN area_managers owner ON owner.user_id=v.managed_by WHERE v.vehicle_id=? AND owner.area_id=? FOR UPDATE');
        $stmt->execute([$id,$area]); $vehicle = $stmt->fetch();
        if (!$vehicle) throw new DomainException('Vehicle not found in your area.',404);
        if ($vehicle['retired_at'] !== null || $vehicle['status'] === 'maintenance') throw new DomainException('This vehicle is retired or under maintenance.',409);
        $stmt = $db->prepare("SELECT delivery_id FROM deliveries WHERE vehicle_id=? AND status IN ('pending','assigned','in_transit') FOR UPDATE");
        $stmt->execute([$id]); $held = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if ($vehicle['status'] === 'in_use' && !$held) throw new DomainException('This vehicle has an unresolved in-use state.',409);
        $stmt = $db->prepare("SELECT delivery_id FROM deliveries WHERE vehicle_id=? AND delivery_id<>?
            AND status IN ('pending','assigned','in_transit') AND (status='in_transit' OR scheduled_at IS NULL OR scheduled_end_at IS NULL
                OR (scheduled_at < ? AND scheduled_end_at > ?)) LIMIT 1 FOR UPDATE");
        $stmt->execute([$id,$delivery,$end,$start]);
        if ($stmt->fetchColumn() !== false) throw new DomainException('This vehicle has an overlapping or unresolved reservation.',409);
    }

    /** in_use means reserved/on delivery, not a clock-driven claim of movement. */
    private static function syncVehicles(?int $old, ?int $next): void
    {
        foreach (array_unique(array_filter([$old,$next],static fn($id)=>$id!==null)) as $id) {
            $stmt = getDbConnection()->prepare("UPDATE vehicles SET status = CASE WHEN EXISTS
                (SELECT 1 FROM deliveries WHERE vehicle_id=? AND status IN ('pending','assigned','in_transit'))
                THEN 'in_use' ELSE 'available' END WHERE vehicle_id=? AND status IN ('available','in_use')");
            $stmt->execute([$id,$id]);
        }
    }

    /** Explicit logistics transitions only; no rental/payment/agreement event simulation. */
    public static function transition(int $managerId, int $deliveryId, int $version, string $status): array
    {
        self::requireAssignmentSchema();
        if ($deliveryId < 1 || $version < 0 || !in_array($status,['in_transit','delivered'],true)) throw new DomainException('Choose in_transit or delivered and a valid version.',422);
        return self::transaction(static function(PDO $db) use($managerId,$deliveryId,$version,$status): array {
            $area=AreaManagerModel::operationalArea($managerId,true);
            $delivery=self::deliveryForArea($deliveryId,$area['area_id'],true);
            self::assertVersion($delivery,$version);
            if ($delivery['status']===$status) return ['changed'=>false,'delivery'=>$delivery];
            if ($delivery['status']!==($status==='in_transit'?'assigned':'in_transit')) throw new DomainException('Invalid delivery status transition.',409);
            if (!$delivery['delivery_personnel_id'] || !$delivery['vehicle_id'] || !$delivery['scheduled_at'] || !$delivery['scheduled_end_at']) throw new DomainException('Both resources and a complete schedule are required.',409);
            $person=(int)$delivery['delivery_personnel_id'];$vehicle=(int)$delivery['vehicle_id'];
            self::lockPersonnelUsers($person,null);self::lockVehicles($vehicle,null);
            if ($status==='in_transit') {
                self::assertStartTime($delivery);
                self::validateVehicle($vehicle,$area['area_id'],$deliveryId,$delivery['scheduled_at'],$delivery['scheduled_end_at']);
                $stmt=$db->prepare("SELECT dp.user_id FROM delivery_personnel dp JOIN users u ON u.user_id=dp.user_id
                    WHERE dp.user_id=? AND dp.area_id=? AND dp.availability_status='available' AND dp.license_expiry>=?
                    AND u.role='delivery_personnel' AND u.account_status='active' FOR UPDATE");
                $stmt->execute([$person,$area['area_id'],self::licenseThrough($delivery['scheduled_end_at'])]);
                if (!$stmt->fetchColumn()) throw new DomainException('Personnel are no longer eligible for this delivery.',409);
                $stmt=$db->prepare("SELECT delivery_id FROM deliveries WHERE delivery_personnel_id=? AND delivery_id<>?
                    AND status IN ('pending','assigned','in_transit') AND (status='in_transit' OR scheduled_at IS NULL OR scheduled_end_at IS NULL
                        OR (scheduled_at < ? AND scheduled_end_at > ?)) LIMIT 1 FOR UPDATE");
                $stmt->execute([$person,$deliveryId,$delivery['scheduled_end_at'],$delivery['scheduled_at']]);
                if ($stmt->fetchColumn()) throw new DomainException('Personnel have an overlapping or unfinished delivery.',409);
                self::assertStartTime($delivery);
            }
            $stmt=$db->prepare('UPDATE deliveries SET status=?,assignment_version=assignment_version+1 WHERE delivery_id=?');
            $stmt->execute([$status,$deliveryId]);self::syncVehicles($vehicle,null);
            self::audit($delivery,$managerId,$status,'Delivery '.$status.'; vehicle #'.$vehicle.'.');
            NotificationService::notify($person,'delivery',$status==='delivered'?'Delivery completed':'Delivery started','Delivery #'.$deliveryId.' is now '.$status.'.');
            return ['changed'=>true,'delivery'=>self::deliveryForArea($deliveryId,$area['area_id'])];
        });
    }

    private static function assertStartTime(array $delivery): void
    {
        $now=(new DateTimeImmutable('now',new DateTimeZone('Asia/Colombo')))->format('Y-m-d H:i:s');
        if ($now < $delivery['scheduled_at']) {
            throw new DomainException('Too early to start. Reserved window: '.$delivery['scheduled_at'].' to '.$delivery['scheduled_end_at'].
                ' (Asia/Colombo, UTC+05:30). Server time: '.$now.'. Wait until the reserved start time.',409);
        }
        if ($now >= $delivery['scheduled_end_at']) {
            throw new DomainException('The reserved window has ended: '.$delivery['scheduled_at'].' to '.$delivery['scheduled_end_at'].
                ' (Asia/Colombo, UTC+05:30). Server time: '.$now.'. Reassign/reschedule a new future window before starting.',409);
        }
    }

    private static function assertVersion(array $delivery, int $version): void
    {
        if ((int) $delivery['assignment_version'] !== $version) throw new DomainException('This delivery changed. Refresh before trying again.', 409);
    }

    private static function lockPersonnelUsers(?int $old, ?int $next): void
    {
        $ids = array_values(array_unique(array_filter([$old, $next], static fn($id) => $id !== null)));
        sort($ids, SORT_NUMERIC);
        $stmt = getDbConnection()->prepare('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE');
        foreach ($ids as $id) $stmt->execute([$id]);
    }

    private static function audit(array $delivery, int $actor, string $status, string $description): void
    {
        $stmt = getDbConnection()->prepare('INSERT INTO delivery_actions (delivery_id, actor_user_id, previous_status, new_status, description) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$delivery['delivery_id'], $actor, $delivery['status'], $status, $description]);
    }

    private static function transaction(callable $action): array
    {
        $db = getDbConnection(); $owns = !$db->inTransaction();
        if ($owns) $db->beginTransaction(); else $db->exec('SAVEPOINT delivery_assignment');
        try {
            $result = $action($db);
            if ($owns) $db->commit(); else $db->exec('RELEASE SAVEPOINT delivery_assignment');
            return $result;
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                if ($owns) $db->rollBack();
                else { $db->exec('ROLLBACK TO SAVEPOINT delivery_assignment'); $db->exec('RELEASE SAVEPOINT delivery_assignment'); }
            }
            throw $e;
        }
    }
}
