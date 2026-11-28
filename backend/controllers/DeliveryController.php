<?php
declare(strict_types=1);
require_once __DIR__ . '/../models/DeliveryModel.php';
require_once __DIR__ . '/AreaManagerController.php';

final class DeliveryController
{
    public static function index(array $params = []): void
    {
        Auth::requireActiveAccount();
        Auth::requireRole(['area_manager']);
        $area = AreaManagerController::requireOperationalArea();
        Response::ok(DeliveryModel::listing($area['area_id'], ListQuery::page(), ListQuery::perPage(),
            ListQuery::enum('status', ['pending', 'assigned', 'in_transit', 'delivered', 'cancelled'])));
    }

    public static function availablePersonnel(array $params = []): void
    {
        self::authorize();
        self::respond(static fn() => DeliveryModel::availablePersonnel((int) Auth::userId(), self::id($params['id'] ?? null),
            self::text($_GET, 'scheduled_at'), self::text($_GET, 'scheduled_end_at')));
    }

    /** Assignment and reassignment share one atomic, versioned operation. */
    public static function assign(array $params = []): void
    {
        self::authorize();
        $body = Router::jsonBody();
        self::fields($body, ['delivery_personnel_id', 'scheduled_at', 'scheduled_end_at', 'expected_version', 'vehicle_id']);
        self::respond(static fn() => DeliveryModel::assignPersonnel((int) Auth::userId(), self::id($params['id'] ?? null),
            self::id($body['delivery_personnel_id'] ?? null), self::text($body, 'scheduled_at'),
            self::text($body, 'scheduled_end_at'), self::id($body['expected_version'] ?? null, true),
            !array_key_exists('vehicle_id',$body) || $body['vehicle_id'] === null ? null : self::id($body['vehicle_id'])));
    }

    public static function availableVehicles(array $params=[]): void
    {
        self::authorize();
        self::respond(static fn()=>DeliveryModel::availableVehicles((int)Auth::userId(),self::id($params['id']??null),
            self::text($_GET,'scheduled_at'),self::text($_GET,'scheduled_end_at')));
    }

    public static function status(array $params=[]): void
    {
        self::authorize();$body=Router::jsonBody();self::fields($body,['status','expected_version']);
        self::respond(static fn()=>DeliveryModel::transition((int)Auth::userId(),self::id($params['id']??null),
            self::id($body['expected_version']??null,true),self::text($body,'status')));
    }

    public static function cancel(array $params = []): void
    {
        self::authorize();
        $body = Router::jsonBody();
        self::fields($body, ['expected_version', 'reason']);
        self::respond(static fn() => DeliveryModel::cancel((int) Auth::userId(), self::id($params['id'] ?? null),
            self::id($body['expected_version'] ?? null, true), self::text($body, 'reason')));
    }

    private static function authorize(): void
    {
        Auth::requireActiveAccount();
        Auth::requireRole(['area_manager']);
        AreaManagerController::requireOperationalArea();
    }

    private static function id($value, bool $zero = false): int
    {
        if ((!is_int($value) && !is_string($value)) || !preg_match('/\A(?:0|[1-9][0-9]*)\z/', (string) $value)
            || strlen((string) $value) > 10 || (float) $value > 2147483647 || (int) $value < ($zero ? 0 : 1)) {
            throw new DomainException('Provide valid integer identifiers and expected_version.', 422);
        }
        return (int) $value;
    }

    private static function text(array $data, string $key): string
    {
        if (!isset($data[$key]) || !is_string($data[$key])) throw new DomainException('Provide ' . $key . ' as text.', 422);
        return $data[$key];
    }

    private static function fields(array $body, array $allowed): void
    {
        if (array_diff(array_keys($body), $allowed)) Response::error('Unexpected assignment fields.', 422);
    }

    private static function respond(callable $operation): void
    {
        try { $result = $operation(); }
        catch (DomainException $e) { Response::error($e->getMessage(), in_array($e->getCode(), [404, 409, 422], true) ? $e->getCode() : 409); }
        catch (PDOException $e) {
            if (in_array((int) ($e->errorInfo[1] ?? 0), [1205, 1213], true)) Response::error('Another assignment is being updated. Refresh and try again.', 409);
            throw $e;
        }
        Response::ok($result);
    }
}
