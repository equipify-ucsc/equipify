<?php
/** Exercise the actual registered routes and role gates, without database writes. */
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
    { throw new CapturedResponse($status, ['error' => $message]); }
}
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Router.php';
require_once __DIR__ . '/../core/ListQuery.php';
require_once __DIR__ . '/../core/Validator.php';
require_once __DIR__ . '/../controllers/MessageController.php';
require_once __DIR__ . '/../models/ComplaintModel.php';
$router = new Router();
require __DIR__ . '/../routes.php';
$checks = 0;
function dispatch(string $verb, string $path, int $expected): void
{
    global $router, $checks;
    try { $router->dispatch($verb, $path); } catch (CapturedResponse $response) {
        if ($response->getCode() !== $expected) throw new RuntimeException("$verb $path: expected $expected, got " . $response->getCode());
        $checks++;
        return;
    }
    throw new RuntimeException('No response');
}
$prefixes = ['customer' => 'customer', 'renting-party' => 'renting_party', 'freelancer' => 'freelance_worker',
    'delivery-personnel' => 'delivery_personnel', 'technician' => 'maintenance_tech'];
foreach ($prefixes as $prefix => $role) {
    foreach ([['GET', 'conversations'], ['GET', 'messages'], ['POST', 'messages'], ['GET', 'message-users'], ['POST', 'conversations']] as [$verb, $suffix]) {
        $_SESSION = [];
        dispatch($verb, "/$prefix/$suffix", 401);
        foreach (array_merge(MessageController::ROLES, ['admin', 'area_manager']) as $otherRole) {
            if ($otherRole === $role) continue;
            $_SESSION = ['user_id' => PHP_INT_MAX, 'role' => $otherRole];
            dispatch($verb, "/$prefix/$suffix", 403);
        }
        $_SESSION = ['user_id' => PHP_INT_MAX, 'role' => $role];
        $_GET = ['conversation_id' => PHP_INT_MAX];
        dispatch($verb, "/$prefix/$suffix", $verb === 'POST' ? 422 : ($suffix === 'messages' ? 404 : 200));
    }
}
echo "PASS: $checks messaging route and role checks.\n";
