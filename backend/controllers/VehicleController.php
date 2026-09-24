<?php
/**
 * An area manager's delivery fleet: add, list, update and remove vehicles.
 *
 * A vehicle has no driver of its own. The area manager picks a vehicle and a
 * delivery person separately for each delivery, so this module only describes
 * the vehicle: its plate, type, payload capacity (kg) and cargo-bed size
 * (length × width, metres).
 *
 * Removing a vehicle hard-deletes it unless delivery history still points at
 * it, in which case it is retired instead (see destroy()). Each manager only
 * ever sees or touches the vehicles they added.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/VehicleModel.php';

final class VehicleController
{
    /** vehicles.vehicle_type => label shown on the page. */
    private const TYPES = [
        'van'             => 'Van',
        'pickup'          => 'Pickup',
        'lorry'           => 'Lorry',
        'truck'           => 'Truck',
        'flatbed'         => 'Flatbed',
        'low_bed_trailer' => 'Low-bed trailer',
    ];

    /**
     * The statuses an area manager can set by hand. in_use belongs to the
     * delivery-assignment workflow: a vehicle is in use because it is on a
     * delivery, not because someone picked that from a dropdown.
     */
    private const EDITABLE_STATUSES = ['available', 'maintenance'];

    /** MySQL "Cannot delete or update a parent row: a foreign key constraint fails". */
    private const MYSQL_ROW_IS_REFERENCED = 1451;

    /** GET /area-manager/vehicles */
    public static function index(array $params = []): void
    {
        Response::ok(array_map(
            [self::class, 'present'],
            VehicleModel::allForManager((int) Auth::userId())
        ));
    }

    /** GET /area-manager/vehicles/{id} */
    public static function show(array $params = []): void
    {
        Response::ok(self::present(self::findOr404($params)));
    }

    /** POST /area-manager/vehicles */
    public static function store(array $params = []): void
    {
        $managerId = (int) Auth::userId();
        $vehicle   = self::readVehicle(Router::jsonBody(), null, null);

        try {
            $vehicleId = VehicleModel::insert($managerId, $vehicle);
        } catch (PDOException $e) {
            // Lost a race with another request adding the same plate.
            if ($e->getCode() === '23000') {
                self::duplicatePlate();
            }
            throw $e;
        }

        Response::ok(self::present((array) VehicleModel::findForManager($vehicleId, $managerId)), 201);
    }

    /** PUT /area-manager/vehicles/{id} */
    public static function update(array $params = []): void
    {
        $managerId = (int) Auth::userId();
        $current   = self::findOr404($params);
        $vehicleId = (int) $current['vehicle_id'];

        if ($current['retired_at'] !== null) {
            Response::error('This vehicle is retired. Restore it before editing.', 409);
        }

        $vehicle = self::readVehicle(Router::jsonBody(), $vehicleId, (string) $current['status']);

        try {
            if (!VehicleModel::update($vehicleId, $managerId, $vehicle)) {
                Response::error('Vehicle not found.', 404);
            }
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                self::duplicatePlate();
            }
            throw $e;
        }

        Response::ok(self::present((array) VehicleModel::findForManager($vehicleId, $managerId)));
    }

    /**
     * DELETE /area-manager/vehicles/{id}
     *
     * Tries a hard delete first. When delivery history still references the
     * vehicle, the deliveries FK (ON DELETE RESTRICT) refuses it, and the
     * vehicle is retired instead so that history keeps its vehicle. The
     * response says which of the two happened.
     */
    public static function destroy(array $params = []): void
    {
        $managerId = (int) Auth::userId();
        $current   = self::findOr404($params);
        $vehicleId = (int) $current['vehicle_id'];

        if ($current['retired_at'] !== null) {
            Response::error('This vehicle is already retired.', 409);
        }
        if ($current['status'] === 'in_use') {
            Response::error('This vehicle is on an active delivery and cannot be removed.', 409);
        }

        try {
            VehicleModel::delete($vehicleId, $managerId);
            $outcome = 'deleted';
        } catch (PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== self::MYSQL_ROW_IS_REFERENCED) {
                throw $e;
            }
            VehicleModel::retire($vehicleId, $managerId);
            $outcome = 'retired';
        }

        Response::ok(['vehicle_id' => $vehicleId, 'outcome' => $outcome]);
    }

    /** POST /area-manager/vehicles/{id}/restore */
    public static function restore(array $params = []): void
    {
        $managerId = (int) Auth::userId();
        $current   = self::findOr404($params);
        $vehicleId = (int) $current['vehicle_id'];

        if ($current['retired_at'] === null || !VehicleModel::restore($vehicleId, $managerId)) {
            Response::error('This vehicle is not retired.', 409);
        }

        Response::ok(self::present((array) VehicleModel::findForManager($vehicleId, $managerId)));
    }

    // ------------------------------------------------------------- helpers

    /**
     * Validates the vehicle fields shared by create and update, ending the
     * request with 422 and a per-field map when anything is wrong.
     *
     * @param int|null    $vehicleId     the vehicle being edited (null on create)
     * @param string|null $currentStatus its status now (null on create)
     * @return array{plate_number:string,vehicle_type:string,max_load_kg:int,
     *               cargo_length_m:string,cargo_width_m:string,status:string}
     */
    private static function readVehicle(array $in, ?int $vehicleId, ?string $currentStatus): array
    {
        $plateRaw = self::str($in, 'plate_number');
        $plate    = self::normalizePlate($plateRaw);
        $type     = self::str($in, 'vehicle_type');
        $maxLoad  = self::num($in, 'max_load_kg');
        $length   = self::num($in, 'cargo_length_m');
        $width    = self::num($in, 'cargo_width_m');
        $status   = self::str($in, 'status');

        $errors = [];
        if ($m = Validator::required($plateRaw, 'Plate number')) {
            $errors['plate_number'] = $m;
        } elseif ($plate === null) {
            $errors['plate_number'] = 'Enter a valid plate number, e.g. WP-CAB-2231 or 253-1234.';
        }
        if ($m = Validator::oneOf($type, array_keys(self::TYPES), 'vehicle type')) {
            $errors['vehicle_type'] = $m;
        }
        if ($m = Validator::required($maxLoad, 'Max load') ?? Validator::intRange($maxLoad, 1, 100000, 'Max load (kg)')) {
            $errors['max_load_kg'] = $m;
        }
        if ($m = Validator::required($length, 'Cargo length') ?? Validator::decimalRange($length, 0.5, 30, 2, 'Cargo length (m)')) {
            $errors['cargo_length_m'] = $m;
        }
        if ($m = Validator::required($width, 'Cargo width') ?? Validator::decimalRange($width, 0.5, 5, 2, 'Cargo width (m)')) {
            $errors['cargo_width_m'] = $m;
        }

        if ($currentStatus === 'in_use') {
            // Only the delivery workflow moves a vehicle out of in_use.
            if ($status !== '' && $status !== 'in_use') {
                Response::error('This vehicle is on an active delivery, so its status cannot be changed.', 409);
            }
            $status = 'in_use';
        } elseif ($m = Validator::oneOf($status, self::EDITABLE_STATUSES, 'status')) {
            $errors['status'] = $m;
        }

        if (!isset($errors['plate_number']) && VehicleModel::plateExists((string) $plate, $vehicleId)) {
            $errors['plate_number'] = VehicleModel::plateIsRetiredForManager((string) $plate, (int) Auth::userId())
                ? 'This plate belongs to a retired vehicle in your fleet. Restore it from the Retired filter instead.'
                : 'A vehicle with this plate number is already registered.';
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        return [
            'plate_number'   => (string) $plate,
            'vehicle_type'   => $type,
            'max_load_kg'    => (int) $maxLoad,
            'cargo_length_m' => $length,
            'cargo_width_m'  => $width,
            'status'         => $status,
        ];
    }

    /**
     * Sri Lankan plates, stored uppercase with hyphens: an optional province
     * code, then 2–3 letters or 2–3 digits, then 4 digits (WP-CAB-2231,
     * CAB-2231, 253-1234). Spaces or hyphens in the input are both accepted,
     * as is "CAB2231" with no separator. Returns null when it doesn't fit.
     */
    private static function normalizePlate(string $value): ?string
    {
        $plate = strtoupper(trim($value));
        $plate = (string) preg_replace('/[\s\-]+/', '-', $plate);
        $plate = (string) preg_replace('/(?<=[A-Z])(?=\d)/', '-', $plate);
        if (strlen($plate) > 15
            || preg_match('/^(?:[A-Z]{2}-)?(?:[A-Z]{2,3}|\d{2,3})-\d{4}$/', $plate) !== 1) {
            return null;
        }
        return $plate;
    }

    /**
     * Shapes a row for the page. DECIMAL columns come back from PDO as
     * strings, so the numbers are cast here.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function present(array $row): array
    {
        $type = (string) $row['vehicle_type'];
        return [
            'vehicle_id'     => (int) $row['vehicle_id'],
            'plate_number'   => $row['plate_number'],
            'vehicle_type'   => $type,
            'type_label'     => self::TYPES[$type] ?? $type,
            'max_load_kg'    => (int) $row['max_load_kg'],
            'cargo_length_m' => (float) $row['cargo_length_m'],
            'cargo_width_m'  => (float) $row['cargo_width_m'],
            'status'         => $row['status'],
            'retired'        => $row['retired_at'] !== null,
            'retired_at'     => $row['retired_at'],
            'created_at'     => $row['created_at'],
        ];
    }

    /**
     * This manager's vehicle for the {id} path segment, or a 404. Another
     * manager's vehicle is indistinguishable from one that doesn't exist.
     *
     * @return array<string,mixed>
     */
    private static function findOr404(array $params): array
    {
        $id  = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $row = ($id === false || $id < 1)
            ? null
            : VehicleModel::findForManager($id, (int) Auth::userId());
        if ($row === null) {
            Response::error('Vehicle not found.', 404);
        }
        return $row;
    }

    private static function duplicatePlate(): void
    {
        Response::error('Please fix the highlighted fields.', 422, [
            'plate_number' => 'A vehicle with this plate number is already registered.',
        ]);
    }

    /** Trimmed string input, or '' when missing / not a string. */
    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }

    /** A number sent either as a JSON number or a numeric string, as a trimmed string. */
    private static function num(array $in, string $key): string
    {
        $value = $in[$key] ?? null;
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }
        return is_string($value) ? trim($value) : '';
    }
}
