<?php
/** CLI regression: public fixture accounts cannot authenticate outside their matching test DB. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$name = getenv('EQUIPIFY_DB_NAME') ?: '';
$port = getenv('EQUIPIFY_DB_PORT') ?: '';
if (!preg_match('/\Aequipify_(week3|week4)_test_[a-z0-9_]+\z/', $name, $suiteMatch)
    || !ctype_digit($port) || (int) $port < 1024 || (int) $port > 65535 || (int) $port === 3306) {
    throw new RuntimeException('Explicit Week 3 or Week 4 fixture and separate non-default test port required.');
}
$suite = $suiteMatch[1];
final class FixtureResponse extends RuntimeException {
    public $data;
    public function __construct($data, int $status) { parent::__construct('', $status); $this->data = $data; }
}
final class Response {
    public static function ok($data = null, int $status = 200): void { throw new FixtureResponse($data, $status); }
    public static function error(string $message, int $status = 400, array $fields = []): void { throw new FixtureResponse($message, $status); }
}
final class Router {
    public static array $body = [];
    public static function jsonBody(): array { return self::$body; }
}
require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../core/Validator.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../controllers/AuthController.php';
$checks = 0;
function verify(bool $ok, string $label): void {
    global $checks;
    if (!$ok) throw new RuntimeException('FAIL: ' . $label);
    $checks++;
}
function login(string $email, string $password, string $role, int $status): void {
    $_SESSION = [];
    Router::$body = ['email' => $email, 'password' => $password, 'portal' => $role];
    try { AuthController::login(); }
    catch (FixtureResponse $response) {
        verify($response->getCode() === $status, 'Expected login status');
        verify($status === 200 ? ($_SESSION['role'] ?? '') === $role : $_SESSION === [], 'Session identity matches result');
        return;
    }
    throw new RuntimeException('No login response.');
}
$db = getDbConnection();
verify(DB_HOST === '127.0.0.1' && $db->query('SELECT DATABASE()')->fetchColumn() === $name
    && (int) $db->query('SELECT @@port')->fetchColumn() === (int) $port, 'Actual isolated connection');
$sessions = __DIR__ . '/../../tmp/precommit-sessions-' . bin2hex(random_bytes(6));
if (!mkdir($sessions, 0700, true)) throw new RuntimeException('Cannot create isolated session directory.');
session_save_path($sessions);
session_start();
$_SERVER['REMOTE_ADDR'] = '127.0.0.67';
$originalEnvironment = [getenv('EQUIPIFY_ENV'), getenv('APP_ENV')];
$roles = ['customer','renting_party','freelance_worker','delivery_personnel','maintenance_tech','area_manager','admin'];
try {
    putenv('EQUIPIFY_ENV'); putenv('APP_ENV');
    foreach ($roles as $role) login($role . '@' . $suite . '.test', ucfirst($suite) . '-Test-Only!42', $role, 200);
    $before = $db->query('SELECT * FROM users ORDER BY user_id')->fetchAll();
    foreach (['EQUIPIFY_ENV=production', 'APP_ENV=prod'] as $setting) {
        putenv($setting);
        foreach ($roles as $role) login($role . '@' . $suite . '.test', ucfirst($suite) . '-Test-Only!42', $role, 401);
        putenv(explode('=', $setting)[0]);
    }
    verify($db->query('SELECT * FROM users ORDER BY user_id')->fetchAll() === $before, 'Production rejections do not change fixture user records');

    // Deliberately misplace synthetic rows in ANOTHER NEW TEST database.
    // All interpolated SQL identifiers are generated/validated above or fixed.
    // No application/production database is inspected, created or modified.
    $guard = 'equipify_areas_test_precommit_' . gmdate('Ymd_His') . '_' . bin2hex(random_bytes(4));
    $db->exec("CREATE DATABASE $guard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $definitions = [];
    foreach ($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        if (!preg_match('/\A[a-z0-9_]+\z/i', $table)) throw new RuntimeException('Unexpected fixture table identifier.');
        $definitions[] = $db->query("SHOW CREATE TABLE $table")->fetch(PDO::FETCH_NUM)[1];
    }
    $db->exec("USE $guard");
    // Preserve every FK, including the users/admins circular dependency.
    $db->exec('SET FOREIGN_KEY_CHECKS = 0');
    try { foreach ($definitions as $definition) $db->exec($definition); }
    finally { $db->exec('SET FOREIGN_KEY_CHECKS = 1'); }
    $db->exec("INSERT INTO $guard.users SELECT * FROM $name.users");
    $db->exec("USE $guard");
    verify($db->query('SELECT DATABASE()')->fetchColumn() === $guard, 'Imported-fixture simulation stays on a new test database');
    foreach ($roles as $role) login($role . '@' . $suite . '.test', ucfirst($suite) . '-Test-Only!42', $role, 401);
    // Ordinary accounts retain the existing login behavior, even in production mode.
    $controlPassword = bin2hex(random_bytes(24));
    $controlEmail = 'precommit-' . bin2hex(random_bytes(8)) . '@example.test';
    $stmt = $db->prepare('INSERT INTO users (email,password_hash,role,full_name,phone) VALUES (?,?,?,?,?)');
    $stmt->execute([$controlEmail, password_hash($controlPassword, PASSWORD_DEFAULT), 'customer', 'Synthetic control', '0779999000']);
    putenv('EQUIPIFY_ENV=production');
    login($controlEmail, $controlPassword, 'customer', 200);

    // The seeder must fail before attempting a DB connection in production.
    putenv('EQUIPIFY_DB_PORT=1');
    $child = proc_open([PHP_BINARY, __DIR__ . '/week3_test.php'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($child)) throw new RuntimeException('Cannot start guarded seeder check.');
    $output = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    verify(proc_close($child) !== 0 && str_contains($output, 'fixtures are disabled in production')
        && !str_contains($output, 'SQLSTATE'), 'Production fixture seeding rejected before DB access');
} finally {
    putenv('EQUIPIFY_DB_PORT=' . $port);
    foreach (['EQUIPIFY_ENV', 'APP_ENV'] as $i => $key) putenv($originalEnvironment[$i] === false ? $key : $key . '=' . $originalEnvironment[$i]);
    $db->exec("USE $name");
    $_SESSION = [];
    session_write_close();
}
echo "PASS: $checks fixture-login isolation and production safety checks; synthetic test databases retained.\n";
