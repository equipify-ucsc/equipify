<?php
declare(strict_types=1);
require_once __DIR__ . '/../models/UserModel.php';
final class AdminUserController
{
    private static function actor(): array {
        $actor = Auth::requireActiveAccount();
        if ($actor['role'] !== 'admin') Response::error('Admin access required.', 403);
        return $actor;
    }
    public static function index(array $params = []): void {
        self::actor();
        Response::ok(UserModel::operationalUsers());
    }
    public static function suspend(array $params): void { self::change($params, 'suspended'); }
    public static function ban(array $params): void { self::change($params, 'banned'); }
    private static function change(array $params, string $status): void {
        $actor = self::actor();
        $id = filter_var($params['id'] ?? '', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id === false) Response::error('Invalid user ID.', 422);
        $input = Router::jsonBody();
        $reason = is_string($input['reason'] ?? null) ? trim($input['reason']) : '';
        if ($reason === '' || mb_strlen($reason, 'UTF-8') > 255) Response::error('Reason must contain 1 to 255 characters.', 422);
        try { $user = UserModel::sanction($id, (int)$actor['user_id'], $status, $reason); }
        catch (DomainException $e) { Response::error($e->getMessage(), (int)$e->getCode()); }
        Response::ok($user);
    }
}
