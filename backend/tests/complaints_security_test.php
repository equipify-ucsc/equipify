<?php
/**
 * Real HTTP session-revocation tests. Requires an explicitly selected isolated
 * database and matching X-Equipify-Test-Database server marker. Creates only
 * synthetic users/complaints; never resets existing users or removes records.
 * EQUIPIFY_DB_NAME=<test-db> php complaints_security_test.php http://localhost:18081
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$database = getenv('EQUIPIFY_DB_NAME') ?: '';
if (!preg_match('/\Aequipify_(?:areas|complaints|week1)_test_[a-z0-9_]+\z/', $database)) {
    throw new RuntimeException('Set EQUIPIFY_DB_NAME to an isolated test database; real equipify is never allowed.');
}
$base = rtrim($argv[1] ?? 'http://localhost:18081', '/');
$url = parse_url($base);
if (!$url || ($url['scheme'] ?? '') !== 'http' || !in_array($url['host'] ?? '', ['localhost', '127.0.0.1'], true)
    || isset($url['user']) || isset($url['pass']) || isset($url['query']) || isset($url['fragment']) || !empty($url['path'])) {
    throw new RuntimeException('Use a loopback-only isolated test server URL.');
}
require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/ComplaintModel.php';
$checks = 0;
function securityCheck(bool $condition, string $label): void
{
    global $checks;
    if (!$condition) throw new RuntimeException('FAILED: ' . $label);
    $checks++;
}
function securityClient()
{
    $client = curl_init();
    curl_setopt_array($client, [CURLOPT_COOKIEFILE => '', CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => false]);
    return $client;
}
function securityRequest($client, string $method, string $path, ?array $body = null): array
{
    global $base, $database;
    $headers = [];
    curl_setopt_array($client, [CURLOPT_URL => $base . $path, CURLOPT_HTTPGET => true,
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_HEADERFUNCTION => static function ($handle, $line) use (&$headers) {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) $headers[strtolower(trim($parts[0]))] = trim($parts[1]);
            return strlen($line);
        }]);
    if ($method !== 'GET') curl_setopt($client, CURLOPT_POSTFIELDS, json_encode($body ?? new stdClass()));
    $raw = curl_exec($client);
    if ($raw === false) throw new RuntimeException('HTTP request failed: ' . curl_error($client));
    if (($headers['x-equipify-test-database'] ?? '') !== $database) throw new RuntimeException('STOP: server isolation marker mismatch.');
    return ['status' => (int) curl_getinfo($client, CURLINFO_RESPONSE_CODE), 'body' => json_decode($raw, true), 'bytes' => $raw];
}
function securityLogin(array $account)
{
    $client = securityClient();
    $response = securityRequest($client, 'POST', '/backend/api/auth/login', [
        'email' => $account['email'], 'password' => $account['password'], 'portal' => $account['role']]);
    securityCheck($response['status'] === 200, 'Normal active login: ' . $account['role']);
    securityCheck(($response['body']['data']['role'] ?? '') === $account['role'], 'Login role preserved: ' . substr($response['bytes'], 0, 1200));
    return $client;
}
function securityFingerprint(PDO $db): string
{
    return hash('sha256', serialize([
        $db->query('SELECT * FROM complaints ORDER BY complaint_id')->fetchAll(),
        $db->query('SELECT * FROM complaint_actions ORDER BY action_id')->fetchAll(),
        glob(__DIR__ . '/../storage/uploads/*') ?: [],
    ]));
}
$probe = securityClient();
securityCheck(securityRequest($probe, 'GET', '/frontend/shared/api.js')['status'] === 200, 'Read-only server isolation preflight');
curl_close($probe);
$db = getDbConnection();
securityCheck($db->query('SELECT DATABASE()')->fetchColumn() === $database, 'PDO targets explicitly isolated database');
$run = 'session-security-' . gmdate('YmdHis') . '-' . bin2hex(random_bytes(4));
$accounts = [];
foreach (array_merge(array_keys(ComplaintModel::TARGET_ROLES), ComplaintModel::REVIEWERS) as $role) {
    $password = bin2hex(random_bytes(16)) . 'aQ7!';
    $email = $run . '-' . $role . '@qa.invalid';
    $id = UserModel::insert(['email' => $email, 'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'role' => $role, 'full_name' => 'Synthetic session security ' . $role,
        'phone' => '+9476' . random_int(1000000, 9999999), 'address_line' => null, 'district' => 'Colombo']);
    $accounts[$role] = ['user_id' => $id, 'email' => $email, 'password' => $password, 'role' => $role];
    if ($role === 'admin') $db->prepare('INSERT INTO admins (user_id) VALUES (?)')->execute([$id]);
}
// Synthetic PNG bytes, never a real document. All access checks use normal login.
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
$evidence = ['name' => 'synthetic-security.png', 'data' => base64_encode($png)];
$complaints = [];
foreach (ComplaintModel::TARGET_ROLES as $role => $targets) {
    $client = securityLogin($accounts[$role]);
    $response = securityRequest($client, 'POST', '/backend/api/complaints', [
        'against_user_id' => $accounts[$targets[0]]['user_id'], 'category' => 'Other',
        'subject' => $run . ' ' . $role, 'description' => 'Synthetic security regression.', 'attachment' => $evidence]);
    securityCheck($response['status'] === 201, 'Active submission: ' . $role);
    $complaints[$role] = (int) $response['body']['data']['complaint_id'];
    curl_close($client);
}
$setStatus = $db->prepare('UPDATE users SET account_status = ? WHERE user_id = ?');
$deniedRequests = 0;
foreach ($accounts as $role => $account) {
    $id = $complaints[$role] ?? $complaints['customer'];
    $targetRole = ComplaintModel::TARGET_ROLES[$role][0] ?? 'customer';
    $payload = ['against_user_id' => $accounts[$targetRole]['user_id'], 'category' => 'Other',
        'subject' => $run . ' blocked write', 'description' => 'Must never persist.', 'attachment' => $evidence];
    $reader = ['GET', '/backend/api/complaints'];
    $routes = [
        ['GET', '/backend/api/complaints/metadata'], ['GET', '/backend/api/complaints/targets'], $reader,
        ['POST', '/backend/api/complaints', $payload], ['GET', '/backend/api/complaints/' . $id],
        ['GET', '/backend/api/complaints/' . $id . '/attachment'],
        ['POST', '/backend/api/complaints/' . $id . '/status', ['status' => 'resolved']],
    ];
    if ($role === 'freelance_worker') {
        $routes[] = ['GET', '/backend/api/freelancer/complaints'];
        $payload['against_user_id'] = $accounts['customer']['user_id'];
        $routes[] = ['POST', '/backend/api/freelancer/complaints', $payload];
    }
    foreach (['suspended', 'banned'] as $status) {
        foreach ($routes as $route) {
            [$method, $path] = $route;
            $body = $route[2] ?? null;
            // Each endpoint gets a distinct session established while active.
            $setStatus->execute(['active', $account['user_id']]);
            $client = securityLogin($account);
            $setStatus->execute([$status, $account['user_id']]);
            $before = securityFingerprint($db);
            $response = securityRequest($client, $method, $path, $body ?? null);
            securityCheck(in_array($response['status'], [401, 403], true), "$status $role denied $method $path");
            securityCheck(securityFingerprint($db) === $before, 'Denied request changed no complaint, audit or upload');
            $deniedRequests++;
            $routeAllowsRole = !str_ends_with($path, '/targets') || isset(ComplaintModel::TARGET_ROLES[$role]);
            if (str_ends_with($path, '/status')) $routeAllowsRole = $role === 'admin';
            if ($method === 'POST' && str_ends_with($path, '/complaints')) $routeAllowsRole = isset(ComplaintModel::TARGET_ROLES[$role]);
            if ($routeAllowsRole) {
                securityCheck(securityRequest($client, 'GET', '/backend/api/auth/me')['status'] === 401, 'Rejected session identity cleared');
                $setStatus->execute(['active', $account['user_id']]);
                securityCheck(securityRequest($client, 'GET', '/backend/api/complaints')['status'] === 401, 'Reactivation does not revive rejected cookie');
            }
            $setStatus->execute(['active', $account['user_id']]);
            curl_close($client);
        }
    }
    $client = securityLogin($account);
    foreach (['/complaints/metadata', '/complaints', '/complaints/' . $id, '/complaints/' . $id . '/attachment'] as $path) {
        $response = securityRequest($client, 'GET', '/backend/api' . $path);
        securityCheck($response['status'] === 200, 'Active/reviewer access retained: ' . $role . ' ' . $path);
        if ($path === '/complaints/' . $id . '/attachment') securityCheck($response['bytes'] === $png, 'Active evidence bytes unchanged');
    }
    $targetStatus = isset(ComplaintModel::TARGET_ROLES[$role]) ? 200 : 403;
    securityCheck(securityRequest($client, 'GET', '/backend/api/complaints/targets')['status'] === $targetStatus, 'Active target-role permissions retained');
    $statusResponse = securityRequest($client, 'POST', '/backend/api/complaints/' . $id . '/status', ['status' => 'under_review']);
    securityCheck($statusResponse['status'] === ($role === 'admin' ? 200 : 403), 'Active Admin-only status permission retained');
    if (isset(ComplaintModel::TARGET_ROLES[$role])) {
        $otherId = $complaints[$role === 'customer' ? 'renting_party' : 'customer'];
        securityCheck(securityRequest($client, 'GET', '/backend/api/complaints/' . $otherId)['status'] === 404, 'Active cross-owner denial retained');
    } else securityCheck(securityRequest($client, 'POST', '/backend/api/complaints', $payload)['status'] === 403, 'Reviewer cannot submit');
    curl_close($client);
}
// Current role changes must invalidate cached reviewer privileges too.
$admin = securityLogin($accounts['admin']);
$changeRole = $db->prepare('UPDATE users SET role = ? WHERE user_id = ?');
$changeRole->execute(['customer', $accounts['admin']['user_id']]);
securityCheck(securityRequest($admin, 'GET', '/backend/api/complaints/metadata')['status'] === 401, 'Stale privileged role rejected');
$changeRole->execute(['admin', $accounts['admin']['user_id']]);
securityCheck(securityRequest($admin, 'GET', '/backend/api/complaints')['status'] === 401, 'Restored role does not revive rejected session');
curl_close($admin);
$anonymous = securityClient();
securityCheck(securityRequest($anonymous, 'GET', '/backend/api/complaints')['status'] === 401, 'Anonymous access remains denied');
curl_close($anonymous);
echo "PASS: $checks complaint session/account-status security assertions; $deniedRequests suspended/banned HTTP requests denied.\n";
echo "Isolated database: $database. Existing accounts were not modified; synthetic fixtures retained.\n";
