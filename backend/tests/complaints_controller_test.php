<?php
/** CLI controller tests using captured responses and request bodies; database reads only. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

final class CapturedResponse extends RuntimeException
{
    public array $body;
    public function __construct(int $status, array $body) { parent::__construct('response', $status); $this->body = $body; }
}
final class Response
{
    public static function ok($data = null, int $status = 200): void { throw new CapturedResponse($status, ['data' => $data]); }
    public static function error(string $message, int $status = 400, array $fields = []): void
    { throw new CapturedResponse($status, ['error' => $message, 'fields' => $fields]); }
}
final class Router
{
    public static array $input = [];
    public static function jsonBody(): array { return self::$input; }
}
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Validator.php';
require_once __DIR__ . '/../core/ListQuery.php';
require_once __DIR__ . '/../controllers/ComplaintController.php';
$checks = 0;
function response(callable $call, int $expected): array
{
    global $checks;
    try { $call(); } catch (CapturedResponse $res) {
        if ($res->getCode() !== $expected) throw new RuntimeException('Unexpected HTTP status: ' . $res->getCode());
        $checks++;
        return $res->body;
    }
    throw new RuntimeException('Controller did not respond.');
}
$db = getDbConnection();
$before = (int) $db->query('SELECT COUNT(*) FROM complaints')->fetchColumn();
foreach (array_keys(ComplaintModel::TARGET_ROLES) as $role) {
    $_SESSION = ['user_id' => PHP_INT_MAX, 'role' => $role];
    // All targets here are deliberately invalid, so the tests never insert a row.
    Router::$input = ['against_user_id' => PHP_INT_MAX, 'category' => 'Other', 'subject' => 'Validation',
        'description' => 'Validation', 'role' => 'admin', 'complainant_id' => 1, 'complainant_role' => 'renting_party'];
    $body = response(static function () { ComplaintController::store(); }, 422);
    if (!isset($body['fields']['against_user_id'])) throw new RuntimeException('Target validation missing');
    response(static function () { ComplaintController::updateStatus(['id' => 1]); }, 403);
    response(static function () { ComplaintController::show(['id' => PHP_INT_MAX]); }, 404);
    response(static function () { ComplaintController::attachment(['id' => PHP_INT_MAX]); }, 404);
    response(static function () { ComplaintController::index(); }, 200);
    response(static function () { ComplaintController::targets(); }, 200);
}
foreach (['admin', 'area_manager'] as $role) {
    $_SESSION = ['user_id' => PHP_INT_MAX, 'role' => $role];
    response(static function () { ComplaintController::store(); }, 403);
    $_GET = ['category' => 'Other', 'sort' => 'subject', 'direction' => 'asc'];
    response(static function () { ComplaintController::index(); }, 200);
    response(static function () { ComplaintController::metadata(); }, 200);
}
$_SESSION = ['user_id' => PHP_INT_MAX, 'role' => 'area_manager'];
response(static function () { ComplaintController::updateStatus(['id' => 1]); }, 403);
$_SESSION = [];
response(static function () { ComplaintController::store(); }, 401);
if ((int) $db->query('SELECT COUNT(*) FROM complaints')->fetchColumn() !== $before) throw new RuntimeException('Unexpected database write');
echo "PASS: $checks controller response checks; complaint row count unchanged.\n";
