<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$name = $argv[1] ?? '';
if (!preg_match('/\Aequipify_areas_test_[a-z0-9_]+\z/', $name)) throw new RuntimeException('Supply an isolated area fixture database.');
putenv('EQUIPIFY_DB_NAME=' . $name);
require_once __DIR__ . '/../config/db_config.php';
$db = getDbConnection();
$checks = 0;
function check(bool $ok, string $label): void {
    global $checks;
    if (!$ok) throw new RuntimeException('FAILED: ' . $label);
    $checks++;
}
function request(string $method, string $path, int $expected, $body = null, string $cookie = ''): array {
    $headers = [];
    $curl = curl_init('http://127.0.0.1:18081' . $path);
    curl_setopt_array($curl, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_COOKIE => $cookie, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_HEADERFUNCTION => static function ($handle, $line) use (&$headers) { $headers[] = trim($line); return strlen($line); }]);
    if ($body !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body));
    $raw = curl_exec($curl);
    if ($raw === false) throw new RuntimeException(curl_error($curl));
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE); curl_close($curl);
    check($status === $expected, "$method $path expected $expected got $status: $raw");
    return ['body' => json_decode($raw, true), 'headers' => $headers, 'raw' => $raw];
}
function login(string $role): string {
    $res = request('POST', '/backend/api/auth/login', 200,
        ['email' => $role . '@areas.test', 'password' => 'Areas-Test-Only!42', 'portal' => $role]);
    $cookie = '';
    foreach ($res['headers'] as $header) {
        if (preg_match('/^Set-Cookie: (PHPSESSID=[^;]+)/i', $header, $m)) $cookie = $m[1];
    }
    if ($cookie !== '') return $cookie;
    throw new RuntimeException('No login cookie');
}
$preflight = request('GET', '/frontend/shared/api.js', 200);
check(in_array('X-Equipify-Test-Database: ' . $name, $preflight['headers'], true), 'Server targets isolated database');
$routes = [['GET','/admin/areas'],['POST','/admin/areas'],['PUT','/admin/areas/1'],
    ['POST','/admin/areas/1/activate'],['POST','/admin/areas/1/deactivate'],
    ['PUT','/admin/area-managers/1/area']];
foreach ($routes as [$method,$path]) request($method, '/backend/api' . $path, 401, $method === 'GET' ? null : [], '');
foreach (['area_manager','customer','renting_party','delivery_personnel','maintenance_tech','freelance_worker'] as $role) {
    $cookie = login($role);
    foreach ($routes as [$method,$path]) request($method, '/backend/api' . $path, 403, $method === 'GET' ? null : [], $cookie);
}
$admin = login('admin');
$base = '/backend/api/admin/areas';
request('GET', $base, 200, null, $admin);
foreach ([[], ['name' => '   '], ['name' => []], ['name' => 12], ['name' => str_repeat('a',101)],
    ['name' => "bad\0name"], ['name' => 'Valid', 'description' => []], ['name' => 'Valid', 'description' => 5],
    ['name' => 'Valid', 'description' => str_repeat('a',5001)], ['name' => 'Valid', 'description' => "bad\0text"],
    ['name' => 'Valid', 'is_active' => false], ['name' => 'Valid', 'area_id' => 3]] as $body) {
    request('POST', $base, 422, $body, $admin);
}
$area = request('POST', $base, 201, ['name' => '  Colombo Operations  ', 'description' => '  Service region  '], $admin)['body']['data'];
$id = $area['area_id'];
check($area['name'] === 'Colombo Operations' && $area['description'] === 'Service region' && $area['is_active'] === true, 'Trimmed fields and active default');
request('POST', $base, 422, ['name' => 'colombo operations'], $admin);
$other = request('POST', $base, 201, ['name' => 'Other Region', 'description' => ''], $admin)['body']['data'];
check($other['description'] === null, 'Empty description becomes NULL');
request('PUT', $base . '/' . $other['area_id'], 422, ['name' => 'Colombo Operations'], $admin);
$updated = request('PUT', "$base/$id", 200, ['name' => 'Colombo Operations', 'description' => null], $admin)['body']['data'];
check($updated['description'] === null, 'Self-name update accepted and description cleared');
request('PUT', "$base/$id", 422, ['name' => 'Changed', 'description' => false], $admin);
request('PUT', "$base/$id", 422, ['name' => 'Changed', 'is_active' => 'invalid'], $admin);
foreach (['0','-1','abc','1.2','999999999999999999999999999999'] as $invalid) {
    request('PUT', "$base/$invalid", 422, ['name' => 'Bad'], $admin);
    request('POST', "$base/$invalid/activate", 422, [], $admin);
    request('POST', "$base/$invalid/deactivate", 422, [], $admin);
}
foreach ([['PUT', "$base/999999999"],['POST', "$base/999999999/activate"],['POST', "$base/999999999/deactivate"]] as [$method,$path]) {
    request($method, $path, 404, $method === 'PUT' ? ['name' => 'Absent'] : [], $admin);
}
request('POST', "$base/$id/deactivate", 422, ['is_active' => true], $admin);
$off = request('POST', "$base/$id/deactivate", 200, [], $admin)['body']['data'];
check($off['is_active'] === false, 'Deactivated without deleting');
request('POST', "$base/$id/deactivate", 200, [], $admin);
request('POST', $base, 422, ['name' => 'COLOMBO OPERATIONS'], $admin);
request('PUT', "$base/$id", 200, ['name' => 'Renamed inactive area', 'description' => '<script>text only</script>'], $admin);
check(request('POST', "$base/$id/activate", 200, [], $admin)['body']['data']['is_active'] === true, 'Reactivated');
request('POST', "$base/$id/activate", 200, [], $admin);
$unicode = str_repeat('界',100);
$boundary = request('POST', $base, 201, ['name' => $unicode, 'description' => str_repeat('界',5000)], $admin)['body']['data'];
check(mb_strlen($boundary['description']) === 5000, 'Multibyte limits accepted');
request('POST', $base, 422, ['name' => str_repeat('界',101)], $admin);
$literal = "Region ' OR 1=1 --";
request('POST', $base, 201, ['name' => $literal], $admin);
$list = request('GET', $base, 200, null, $admin)['body']['data'];
check(count($list) === 5 && count(array_filter($list, static fn($row) => $row['name'] === $literal)) === 1, 'Prepared SQL and full list');
request('DELETE', "$base/$id", 405, [], $admin);
check((int) $db->query('SELECT COUNT(*) FROM areas')->fetchColumn() === 5, 'All area records retained');
// Regression: existing manager registration remains functional and unassigned.
$manager = request('POST', '/backend/api/admin/area-managers', 201, ['full_name' => 'Registration regression',
    'email' => 'new-manager@areas.test', 'phone' => '0778899999', 'district' => 'Colombo', 'password' => 'Areas-Test-Only!42'], $admin)['body']['data'];
$managers = request('GET', '/backend/api/admin/area-managers', 200, null, $admin)['body']['data'];
check(count($managers) === 1 && (int) $managers[0]['user_id'] === $manager['user_id'], 'Manager registration/list regression');
check(array_key_exists('area_id', $managers[0]) && $managers[0]['area_id'] === null && $managers[0]['area_name'] === null, 'New manager is explicitly unassigned');
$managerId = $manager['user_id'];
$assignment = '/backend/api/admin/area-managers/' . $managerId . '/area';
$accountBefore = $db->query("SELECT * FROM users WHERE user_id = $managerId")->fetch();
$registeredBefore = $db->query("SELECT registered_by FROM area_managers WHERE user_id = $managerId")->fetchColumn();
foreach ([[], ['area_id' => ''], ['area_id' => '2'], ['area_id' => false], ['area_id' => true],
    ['area_id' => 1.5], ['area_id' => 0], ['area_id' => -1], ['area_id' => []], ['area_id' => (object) []],
    ['area_id' => 9999999999999999999999.0], ['area_id' => null, 'account_status' => 'banned']] as $body) {
    request('PUT', $assignment, 422, $body, $admin);
}
foreach (['0','-1','abc','1.5','9999999999999999999999999999'] as $invalid) {
    request('PUT', '/backend/api/admin/area-managers/' . $invalid . '/area', 422, ['area_id' => $id], $admin);
}
request('PUT', '/backend/api/admin/area-managers/999999999/area', 404, ['area_id' => $id], $admin);
$nonManager = (int) $db->query("SELECT user_id FROM users WHERE role = 'customer' LIMIT 1")->fetchColumn();
request('PUT', '/backend/api/admin/area-managers/' . $nonManager . '/area', 404, ['area_id' => null], $admin);
request('PUT', $assignment, 422, ['area_id' => 999999999], $admin);
request('PUT', $assignment, 422, ['area_id' => 1], $admin); // Model fixture remains inactive.
$assigned = request('PUT', $assignment, 200, ['area_id' => $id], $admin)['body']['data'];
check($assigned['area_id'] === $id && $assigned['area_name'] === 'Renamed inactive area', 'Active assignment returns name and integer ID');
request('PUT', $assignment, 200, ['area_id' => $id], $admin);
$secondManager = request('POST', '/backend/api/admin/area-managers', 201, ['full_name' => 'Second manager',
    'email' => 'second-manager@areas.test', 'phone' => '0778899998', 'district' => 'Galle', 'password' => 'Areas-Test-Only!42'], $admin)['body']['data'];
$secondId = $secondManager['user_id'];
request('PUT', "/backend/api/admin/area-managers/$secondId/area", 200, ['area_id' => $id], $admin);
$shared = request('GET', '/backend/api/admin/area-managers', 200, null, $admin)['body']['data'];
check(count($shared) === 2 && count(array_filter($shared, static fn($row) => $row['area_id'] === $id)) === 2, 'Multiple managers share the same area');
$newAreaId = $other['area_id'];
$changed = request('PUT', $assignment, 200, ['area_id' => $newAreaId], $admin)['body']['data'];
check($changed['area_id'] === $newAreaId && $changed['area_name'] === 'Other Region', 'Change assigned area');
// Invalid target must preserve the current assignment and close its transaction.
request('PUT', $assignment, 422, ['area_id' => 999999999], $admin);
check((int) $db->query("SELECT area_id FROM area_managers WHERE user_id = $managerId")->fetchColumn() === $newAreaId, 'Invalid assignment rolls back');
request('PUT', $base . '/' . $newAreaId, 200, ['name' => 'Updated area name'], $admin);
$renamedList = request('GET', '/backend/api/admin/area-managers', 200, null, $admin)['body']['data'];
$renamed = array_values(array_filter($renamedList, static fn($row) => (int) $row['user_id'] === $managerId))[0];
check($renamed['area_name'] === 'Updated area name', 'Listing reflects renamed area through join');
request('POST', $base . '/' . $newAreaId . '/deactivate', 200, [], $admin);
request('PUT', $assignment, 422, ['area_id' => $newAreaId], $admin);
$offList = request('GET', '/backend/api/admin/area-managers', 200, null, $admin)['body']['data'];
$offManager = array_values(array_filter($offList, static fn($row) => (int) $row['user_id'] === $managerId))[0];
check($offManager['area_id'] === $newAreaId && $offManager['area_name'] === 'Updated area name', 'Existing inactive assignment remains visible');
$unassigned = request('PUT', $assignment, 200, ['area_id' => null], $admin)['body']['data'];
check($unassigned['area_id'] === null && $unassigned['area_name'] === null, 'Explicit null unassigns even an inactive area');
request('PUT', $assignment, 200, ['area_id' => null], $admin);
check($db->query("SELECT * FROM users WHERE user_id = $managerId")->fetch() === $accountBefore, 'Assignment preserves all account fields and status');
check($db->query("SELECT registered_by FROM area_managers WHERE user_id = $managerId")->fetchColumn() === $registeredBefore, 'Registration history preserved');
// A manager's reassignment must not propagate to staff in Step 1B.
$driverId = (int) $db->query("SELECT user_id FROM users WHERE role = 'delivery_personnel' LIMIT 1")->fetchColumn();
$techId = (int) $db->query("SELECT user_id FROM users WHERE role = 'maintenance_tech' LIMIT 1")->fetchColumn();
$db->exec("INSERT INTO delivery_personnel (user_id, registered_by, area_id, driving_license_no, license_class, license_expiry)
    VALUES ($driverId, $managerId, $newAreaId, 'ASSIGN-TEST', 'B', '2030-01-01')");
$db->exec("INSERT INTO maintenance_techs (user_id, registered_by, area_id) VALUES ($techId, $managerId, $newAreaId)");
request('PUT', $assignment, 200, ['area_id' => $id], $admin);
check((int) $db->query("SELECT area_id FROM delivery_personnel WHERE user_id = $driverId")->fetchColumn() === $newAreaId
    && (int) $db->query("SELECT area_id FROM maintenance_techs WHERE user_id = $techId")->fetchColumn() === $newAreaId, 'Staff assignments unchanged');
$db->exec("UPDATE users SET account_status = 'suspended' WHERE user_id = $managerId");
request('PUT', $assignment, 200, ['area_id' => null], $admin);
check($db->query("SELECT account_status FROM users WHERE user_id = $managerId")->fetchColumn() === 'suspended', 'Existing account status is not changed by assignment');
require_once __DIR__ . '/../models/AreaManagerModel.php';
$db->beginTransaction();
AreaManagerModel::assignArea($managerId, $id);
$db->rollBack();
check(AreaManagerModel::find($managerId)['area_id'] === null, 'Model respects outer transaction rollback');
$finalManagers = request('GET', '/backend/api/admin/area-managers', 200, null, $admin)['body']['data'];
check(count($finalManagers) === 2 && count(array_filter($finalManagers, static fn($row) => $row['area_id'] === null)) === 1, 'Unassigned manager remains in listing');
$page = request('GET', '/frontend/Admin/Area%20Managers/index.html', 200);
check(strpos($page['raw'], 'id="managerForm"') !== false && strpos($page['raw'], 'id="areaForm"') !== false, 'Both independent forms present');
request('GET', '/frontend/Admin/Area%20Managers/areas.js', 200);
check(strpos($page['raw'], 'id="managerAreaForm"') !== false, 'Assignment form added alongside existing area and manager forms');
echo "PASS: $checks area API/validation/role/registration regression checks against $name.\n";
