<?php
/**
 * Admin: every platform account (except other admins) and the account-status
 * decision — suspend, ban, deactivate or reactivate. Used by the Complaints &
 * Users page's user list and by the Area Managers page. routes.php restricts
 * both endpoints to the admin role.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/UserModel.php';

final class AdminUserController
{
    private const ROLES = [
        'customer', 'renting_party', 'freelance_worker', 'maintenance_tech',
        'delivery_personnel', 'area_manager',
    ];

    private const STATUSES = ['active', 'suspended', 'banned', 'deactivated'];

    /** GET /admin/users?q=&role=&status=&sort=role|status&dir=asc|desc&page=&per_page= */
    public static function index(array $params = []): void
    {
        $filters = [
            'q'      => ListQuery::search(),
            'role'   => ListQuery::enum('role', self::ROLES),
            'status' => ListQuery::enum('status', self::STATUSES),
        ];
        $sort    = ListQuery::enum('sort', ['role', 'status']);
        $dir     = ListQuery::enum('dir', ['asc', 'desc']);
        $page    = ListQuery::page();
        $perPage = ListQuery::perPage();

        $total = UserModel::countForAdmin($filters);
        $rows  = UserModel::pageForAdmin($filters, $sort, $dir, $perPage, ($page - 1) * $perPage);

        Response::ok(ListQuery::envelope($rows, $page, $perPage, $total));
    }

    /** POST /admin/users/{id}/status  {status, reason} */
    public static function updateStatus(array $params = []): void
    {
        $adminId = (int) Auth::userId();
        $userId  = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $user    = $userId === false || $userId < 1 ? null : UserModel::findById($userId);
        if ($user === null) {
            Response::error('User not found.', 404);
        }
        if ($user['role'] === 'admin' || (int) $user['user_id'] === $adminId) {
            Response::error("An admin account's status can't be changed here.", 422);
        }

        $in     = Router::jsonBody();
        $status = is_string($in['status'] ?? null) ? trim($in['status']) : '';
        $reason = is_string($in['reason'] ?? null) ? trim($in['reason']) : '';

        $errors = [];
        $statusError = Validator::oneOf($status, self::STATUSES, 'status');
        if ($statusError !== null) {
            $errors['status'] = $statusError;
        }
        if ($status !== 'active') {
            $reasonError = Validator::required($reason, 'Reason') ?? Validator::maxLength($reason, 255, 'Reason');
            if ($reasonError !== null) {
                $errors['reason'] = $reasonError;
            }
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        UserModel::setAccountStatus((int) $user['user_id'], $status, $reason === '' ? null : $reason, $adminId);
        Response::ok(UserModel::findForAdmin((int) $user['user_id']));
    }
}
