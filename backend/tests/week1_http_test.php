<?php
/** Run only against the isolated Apache instance and a week1_test.php database. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$name = $argv[1] ?? '';
if (!preg_match('/\Aequipify_week1_test_[a-z0-9_]+\z/', $name)) throw new RuntimeException('Supply the temporary database name.');
putenv('EQUIPIFY_DB_NAME=' . $name);
require_once __DIR__ . '/../config/db_config.php';
$db = getDbConnection();
$base = 'http://127.0.0.1:18081';
$checks = 0;
function verify(bool $ok, string $label): void {
    global $checks;
    if (!$ok) throw new RuntimeException('FAILED: ' . $label);
    $checks++;
}
function request(string $path, int $expected, ?array $body = null, string $cookie = '', array $headers = []): array {
    global $base;
    $curl = curl_init($base . $path);
    $responseHeaders = [];
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_COOKIE => $cookie, CURLOPT_HTTPHEADER => $headers ?: ['Content-Type: application/json'],
        CURLOPT_HEADERFUNCTION => static function ($handle, $line) use (&$responseHeaders) {
            $responseHeaders[] = trim($line); return strlen($line);
        }]);
    if ($body !== null) curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($body)]);
    $raw = curl_exec($curl);
    if ($raw === false) throw new RuntimeException(curl_error($curl));
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    verify($status === $expected, $path . ' expected ' . $expected . ' got ' . $status);
    return ['data' => json_decode($raw, true), 'headers' => $responseHeaders, 'raw' => $raw];
}
function login(string $role): string {
    $response = request('/backend/api/auth/login', 200,
        ['email' => $role . '@week1.test', 'password' => 'Week1-Test-Only!42', 'portal' => $role]);
    verify($response['data']['data']['role'] === $role, 'Correct login role');
    $cookie = '';
    foreach ($response['headers'] as $header) {
        if (preg_match('/^Set-Cookie: (PHPSESSID=[^;]+).*HttpOnly.*SameSite=Lax/i', $header, $match)) $cookie = $match[1];
    }
    verify($cookie !== '', 'Session cookie HTTP-only and SameSite');
    return $cookie;
}
$preflight = request('/frontend/shared/complaints.js', 200);
verify(in_array('X-Equipify-Test-Database: ' . $name, $preflight['headers'], true), 'Server explicitly targets the supplied temporary database');
foreach (['/.git/config','/.gitignore','/schema/031_create_complaints.sql','/backend/config/db_config.php',
    '/backend/models/UserModel.php','/backend/tests/week1_test.php','/backend/tools/create_admin.php',
    '/backend/storage/uploads/.gitkeep','/tmp/week1/httpd.conf','/README.md',
    '/sessions/sess_precommit_probe','/frontend/sess_precommit_probe','/frontend/precommit-probe.eml'] as $path) request($path, 403);
request('/frontend/shared/complaints.js', 200);
request('/backend/api/notifications', 401);
request('/backend/api/complaints', 401);
request('/backend/api/auth/login', 415, ['email' => 'invalid'], '', ['Content-Type: text/plain']);
$customer = login('customer');
$manager = login('area_manager');
$admin = login('admin');
$driver = login('delivery_personnel');
request('/backend/api/admin/area-managers', 403, null, $customer);
request('/backend/api/admin/area-managers', 200, null, $admin);
request('/backend/api/area-manager/delivery-personnel', 200, null, $manager);
$vehicle = (int) $db->query('SELECT vehicle_id FROM vehicles LIMIT 1')->fetchColumn();
// Vehicle retirement fallback is exercised through its actual DELETE route.
$curl = curl_init($base . '/backend/api/area-manager/vehicles/' . $vehicle);
curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => 'DELETE',
    CURLOPT_COOKIE => $manager, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_TIMEOUT => 15]);
$raw = curl_exec($curl);
verify(curl_getinfo($curl, CURLINFO_RESPONSE_CODE) === 200 && json_decode($raw, true)['data']['outcome'] === 'retired', 'Vehicle with delivery history retires via API');
curl_close($curl);
$targets = request('/backend/api/complaints/targets', 200, null, $customer)['data']['data'];
$owner = (int) $db->query("SELECT user_id FROM users WHERE role = 'renting_party'")->fetchColumn();
verify(in_array($owner, array_map(static fn($target) => (int) $target['user_id'], $targets), true), 'Authorized complaint target available');
$row = request('/backend/api/complaints', 201, ['against_user_id' => $owner, 'category' => 'Other',
    'subject' => 'HTTP Week 1', 'description' => 'Synthetic API fixture'], $customer)['data']['data'];
$id = (int) $row['complaint_id'];
verify($row['status'] === 'open', 'HTTP submission retains open default');
request('/backend/api/complaints/' . $id, 404, null, $driver);
request('/backend/api/complaints/' . $id . '/status', 403, ['status' => 'resolved'], $manager);
request('/backend/api/complaints/' . $id . '/status', 422, ['status' => 'dismissed'], $admin);
request('/backend/api/complaints/' . $id . '/status', 200, ['status' => 'under_review'], $admin);
request('/backend/api/complaints/' . $id . '/status', 200, ['status' => 'resolved'], $admin);
verify((int) $db->query("SELECT COUNT(*) FROM complaint_actions WHERE complaint_id = $id")->fetchColumn() === 2, 'API status changes audited');
$listing = request('/backend/api/complaints?status=resolved&category=Other&q=HTTP', 200, null, $customer)['data']['data'];
verify($listing['total'] === 1, 'HTTP complaint filters');
$recipient = (int) $db->query("SELECT user_id FROM users WHERE role = 'customer'")->fetchColumn();
$db->exec("INSERT INTO notifications (user_id, type, title, body) VALUES ($recipient, 'test', 'HTTP', 'Synthetic')");
$notificationId = (int) $db->lastInsertId();
$marked = request('/backend/api/notifications/read', 200, ['notification_id' => $notificationId], $driver)['data']['data'];
verify($marked['marked'] === 0, 'HTTP notification ownership');
request('/backend/api/notifications?unread=1', 200, null, $customer);
request('/backend/api/notifications/read', 422, [], $customer);
verify(request('/backend/api/notifications/read', 200, ['all' => true], $customer)['data']['data']['marked'] === 1, 'HTTP mark all owned notifications');
request('/backend/api/auth/login', 401, ['email' => 'customer@week1.test', 'password' => 'wrong', 'portal' => 'customer']);
request('/backend/api/auth/login', 401, ['email' => 'customer@week1.test', 'password' => 'Week1-Test-Only!42', 'portal' => 'admin']);
$countBefore = (int) $db->query('SELECT COUNT(*) FROM login_attempts')->fetchColumn();
for ($i = 0; $i < 5; $i++) request('/backend/api/auth/login', 401, ['email' => 'http-rate@week1.test', 'password' => 'wrong']);
$blocked = request('/backend/api/auth/login', 429, ['email' => 'http-rate@week1.test', 'password' => 'wrong']);
verify(in_array('Retry-After: 900', $blocked['headers'], true), 'Throttle Retry-After header');
verify((int) $db->query('SELECT COUNT(*) FROM login_attempts')->fetchColumn() === $countBefore + 5, 'Login writes confined to temporary database');
request('/backend/api/auth/logout', 200, [], $customer);
request('/backend/api/notifications', 401, null, $customer);
echo "PASS: $checks Apache/API/security checks against $name.\n";
