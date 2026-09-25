<?php
declare(strict_types=1);

require_once __DIR__ . '/../models/ComplaintModel.php';
require_once __DIR__ . '/../core/Upload.php';

final class ComplaintController
{
    public const MAX_ATTACHMENT_BYTES = 5242880;

    public static function metadata(array $params = []): void
    {
        Response::ok(['categories' => ComplaintModel::CATEGORIES, 'statuses' => ComplaintModel::STATUSES,
            'target_roles' => ComplaintModel::TARGET_ROLES[Auth::role()] ?? [],
            'max_attachment_bytes' => self::MAX_ATTACHMENT_BYTES]);
    }

    public static function targets(array $params = []): void
    {
        Response::ok(ComplaintModel::targets((int) Auth::userId(), (string) Auth::role()));
    }

    public static function index(array $params = []): void
    {
        $owner = in_array(Auth::role(), ComplaintModel::REVIEWERS, true) ? null : (int) Auth::userId();
        $data = ComplaintModel::listing($owner, ListQuery::search(),
            ListQuery::enum('status', ComplaintModel::STATUSES), ListQuery::search('category'),
            ListQuery::search('sort'), ListQuery::search('direction'), ListQuery::page(), ListQuery::perPage());
        $data['items'] = array_map([self::class, 'present'], $data['items']);
        Response::ok($data);
    }

    public static function store(array $params = []): void
    {
        Auth::requireRole(array_keys(ComplaintModel::TARGET_ROLES));
        $in = Router::jsonBody();
        $id = filter_var($in['against_user_id'] ?? null, FILTER_VALIDATE_INT);
        $target = ($id === false || $id < 1) ? null : ComplaintModel::target($id);
        $errors = [];
        if ($target === null || $target['account_status'] !== 'active' ||
            !ComplaintModel::canTarget((int) Auth::userId(), (string) Auth::role(), (int) $id, $target['role'])) {
            $errors['against_user_id'] = 'Select an authorized user to complain against. You cannot select yourself.';
        }
        $input = [];
        foreach (['category' => 80, 'subject' => 150, 'description' => 2000] as $field => $limit) {
            $input[$field] = is_string($in[$field] ?? null) ? trim($in[$field]) : '';
            $message = Validator::required($input[$field], ucfirst($field)) ??
                Validator::maxLength($input[$field], $limit, ucfirst($field));
            if ($message !== null) $errors[$field] = $message;
        }
        if (!in_array($input['category'], ComplaintModel::CATEGORIES, true)) $errors['category'] = 'Select a valid category.';
        $prepared = null;
        if (isset($in['attachment'])) {
            $prepared = Upload::prepare($in['attachment'], Upload::DOCUMENTS, self::MAX_ATTACHMENT_BYTES, 'Supporting evidence');
            if (is_string($prepared)) $errors['attachment'] = $prepared;
        }
        if ($errors) Response::error('Please fix the highlighted fields.', 422, $errors);

        $path = null;
        try {
            if ($prepared !== null) $path = Upload::store($prepared);
            $complaintId = ComplaintModel::insert((int) Auth::userId(), (string) Auth::role(), (int) $id, $input, $path);
        } catch (Throwable $e) {
            if ($path !== null) Upload::discard($path);
            if ($e instanceof DomainException) Response::error($e->getMessage(), 422);
            throw $e;
        }
        Response::ok(self::present((array) ComplaintModel::find($complaintId)), 201);
    }

    public static function show(array $params = []): void
    {
        Response::ok(self::present(self::authorized($params)));
    }

    public static function updateStatus(array $params = []): void
    {
        Auth::requireRole(['admin']);
        $row = self::authorized($params);
        $status = Router::jsonBody()['status'] ?? null;
        if (!in_array($status, ComplaintModel::STATUSES, true)) Response::error('Select a valid status.', 422);
        ComplaintModel::updateStatus((int) $row['complaint_id'], $status);
        Response::ok(self::present((array) ComplaintModel::find((int) $row['complaint_id'])));
    }

    public static function attachment(array $params = []): void
    {
        $row = self::authorized($params);
        $path = $row['attachment_url'] ?? '';
        // Only files managed by Upload may be streamed; never redirect to a supplied URL.
        if (!preg_match('#^uploads/[a-f0-9]{32}\.(pdf|jpg|png|webp)$#D', $path, $match)) {
            Response::error('Evidence not found.', 404);
        }
        $full = __DIR__ . '/../storage/' . $path;
        if (!is_file($full)) Response::error('Evidence not found.', 404);
        $mimes = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
        header('Content-Type: ' . $mimes[$match[1]]);
        header('Content-Disposition: inline; filename="evidence.' . $match[1] . '"');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        header("Content-Security-Policy: sandbox");
        header('Content-Length: ' . filesize($full));
        readfile($full);
        exit;
    }

    private static function authorized(array $params): array
    {
        $id = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $row = ($id === false || $id < 1) ? null : ComplaintModel::find($id);
        if ($row === null || !ComplaintModel::canView($row, (int) Auth::userId(), (string) Auth::role())) {
            Response::error('Complaint not found.', 404);
        }
        return $row;
    }

    private static function present(array $row): array
    {
        $row['complaint_id'] = (int) $row['complaint_id'];
        $row['attachment_url'] = empty($row['attachment_url']) ? null : '/complaints/' . $row['complaint_id'] . '/attachment';
        return $row;
    }
}
