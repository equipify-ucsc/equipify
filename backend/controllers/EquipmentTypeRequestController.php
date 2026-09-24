<?php
/**
 * New equipment-type requests. A renting party whose item fits no type lists
 * it under the category's "Other" type and asks for a proper one; an admin
 * approves (which creates the type, with its spec fields, in the same
 * transaction as marking the request) or rejects with a note.
 *
 * Existing "Other" listings are not moved automatically on approval: only the
 * owner knows which of their listings the new type fits, and moving a listing
 * means answering the new type's spec fields.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/EquipmentCategoryModel.php';
require_once __DIR__ . '/../models/EquipmentTypeRequestModel.php';
require_once __DIR__ . '/../services/CatalogueService.php';
require_once __DIR__ . '/AdminCatalogueController.php';

final class EquipmentTypeRequestController
{
    private const STATUSES = [
        'pending'  => 'Pending',
        'approved' => 'Approved',
        'rejected' => 'Rejected',
    ];

    /** GET /renting-party/type-requests — the party's own recent requests */
    public static function mine(array $params = []): void
    {
        Response::ok(array_map(
            [self::class, 'present'],
            EquipmentTypeRequestModel::forRequester((int) Auth::userId())
        ));
    }

    /** POST /renting-party/type-requests — body: {category_id, proposed_name, reason} */
    public static function store(array $params = []): void
    {
        $userId     = (int) Auth::userId();
        $in         = Router::jsonBody();
        $categoryId = filter_var($in['category_id'] ?? null, FILTER_VALIDATE_INT);
        $name       = is_string($in['proposed_name'] ?? null) ? trim($in['proposed_name']) : '';
        $reason     = is_string($in['reason'] ?? null) ? trim($in['reason']) : '';

        $errors   = [];
        $category = ($categoryId === false || $categoryId < 1) ? null : EquipmentCategoryModel::findCategory($categoryId);
        if ($category === null || !(bool) $category['is_active']) {
            $errors['category_id'] = 'Select a valid category.';
        }
        if ($m = Validator::required($name, 'Type name') ?? Validator::maxLength($name, 80, 'Type name')) {
            $errors['proposed_name'] = $m;
        }
        if ($m = Validator::maxLength($reason, 500, 'Reason')) {
            $errors['reason'] = $m;
        }
        if ($errors === []) {
            if (EquipmentCategoryModel::typeNameExists((int) $categoryId, $name)) {
                $errors['proposed_name'] = 'This category already has a type with this name.';
            } elseif (EquipmentTypeRequestModel::pendingExists($userId, (int) $categoryId, $name)) {
                $errors['proposed_name'] = 'You have already requested this type. We will review it soon.';
            }
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        $requestId = EquipmentTypeRequestModel::insert($userId, (int) $categoryId, $name, $reason === '' ? null : $reason);
        Response::ok(self::present((array) EquipmentTypeRequestModel::find($requestId)), 201);
    }

    /** GET /admin/type-requests?status=pending|approved|rejected|&page= */
    public static function index(array $params = []): void
    {
        $status  = ListQuery::enum('status', array_keys(self::STATUSES));
        $page    = ListQuery::page();
        $perPage = ListQuery::perPage(10);

        $total = EquipmentTypeRequestModel::count($status);
        $rows  = EquipmentTypeRequestModel::page($status, $perPage, ($page - 1) * $perPage);

        $data = ListQuery::envelope(array_map([self::class, 'present'], $rows), $page, $perPage, $total);
        $data['pending_count'] = EquipmentTypeRequestModel::count('pending');
        Response::ok($data);
    }

    /**
     * POST /admin/type-requests/{id}/approve — body: {name, fields: [...]}, the
     * same shape as creating a type. The type is created in the request's
     * category and the request is marked approved in one transaction.
     */
    public static function approve(array $params = []): void
    {
        $request = self::pendingOr409($params);
        $adminId = (int) Auth::userId();

        [$name, $fields] = AdminCatalogueController::readTypeInput(Router::jsonBody(), (int) $request['category_id'], 0);

        try {
            $typeId = CatalogueService::approveRequest((int) $request['request_id'], $adminId, (int) $request['category_id'], $name, $fields);
        } catch (DomainException $e) {
            Response::error($e->getMessage(), 409);
        }
        Response::ok(self::present((array) EquipmentTypeRequestModel::find((int) $request['request_id'])) + ['type_id' => $typeId]);
    }

    /** POST /admin/type-requests/{id}/reject — body: {admin_note} */
    public static function reject(array $params = []): void
    {
        $request = self::pendingOr409($params);
        $in      = Router::jsonBody();
        $note    = is_string($in['admin_note'] ?? null) ? trim($in['admin_note']) : '';
        if ($m = Validator::required($note, 'A note') ?? Validator::maxLength($note, 500, 'Note')) {
            Response::error('Please fix the highlighted fields.', 422, ['admin_note' => $m]);
        }
        if (!EquipmentTypeRequestModel::decide((int) $request['request_id'], 'rejected', (int) Auth::userId(), $note, null)) {
            Response::error('This request has already been reviewed.', 409);
        }
        Response::ok(self::present((array) EquipmentTypeRequestModel::find((int) $request['request_id'])));
    }

    // ------------------------------------------------------------- helpers

    /** @return array<string,mixed> */
    private static function pendingOr409(array $params): array
    {
        $id  = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $row = ($id === false || $id < 1) ? null : EquipmentTypeRequestModel::find($id);
        if ($row === null) {
            Response::error('Request not found.', 404);
        }
        if ($row['status'] !== 'pending') {
            Response::error('This request has already been reviewed.', 409);
        }
        return $row;
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function present(array $row): array
    {
        $status = (string) $row['status'];
        return [
            'request_id'         => (int) $row['request_id'],
            'category_id'        => (int) $row['category_id'],
            'category_name'      => $row['category_name'],
            'proposed_name'      => $row['proposed_name'],
            'reason'             => $row['reason'],
            'business_name'      => $row['business_name'],
            'status'             => $status,
            'status_label'       => self::STATUSES[$status] ?? $status,
            'admin_note'         => $row['admin_note'],
            'resolved_type_id'   => $row['resolved_type_id'] === null ? null : (int) $row['resolved_type_id'],
            'resolved_type_name' => $row['resolved_type_name'],
            'reviewed_at'        => $row['reviewed_at'],
            'created_at'         => $row['created_at'],
        ];
    }
}
