<?php
/** Extends the Step 1A/1B HTTP regression suite in the same isolated database. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/areas_http_test.php';
$scopeStart = $checks;
$db->exec("INSERT INTO equipment_categories (slug, name, icon) VALUES ('scope-fixture', 'Scope test category', 'build')");
$categoryId = (int) $db->lastInsertId();
$areaA = request('POST', $base, 201, ['name' => 'Scope Area A'], $admin)['body']['data']['area_id'];
$areaB = request('POST', $base, 201, ['name' => 'Scope Area B'], $admin)['body']['data']['area_id'];
$managers = []; $cookies = [];
foreach (['a','peer','b','unassigned'] as $i => $key) {
    $manager = request('POST', '/backend/api/admin/area-managers', 201, ['full_name' => 'Scope ' . $key,
        'email' => 'scope-' . $key . '@areas.test', 'phone' => '077889990' . $i,
        'district' => 'Colombo', 'password' => 'Areas-Test-Only!42'], $admin)['body']['data'];
    $managers[$key] = $manager['user_id'];
    if ($key !== 'unassigned') request('PUT', '/backend/api/admin/area-managers/' . $manager['user_id'] . '/area', 200,
        ['area_id' => $key === 'b' ? $areaB : $areaA], $admin);
    $res = request('POST', '/backend/api/auth/login', 200, ['email' => 'scope-' . $key . '@areas.test', 'password' => 'Areas-Test-Only!42', 'portal' => 'area_manager']);
    foreach ($res['headers'] as $header) if (preg_match('/^Set-Cookie: (PHPSESSID=[^;]+)/i', $header, $match)) $cookies[$key] = $match[1];
}
$paths = ['/area-manager/delivery-personnel','/area-manager/technicians','/area-manager/vehicles'];
foreach ($paths as $path) {
    request('GET', '/backend/api' . $path, 409, null, $cookies['unassigned']);
    request('POST', '/backend/api' . $path, 409, [], $cookies['unassigned']);
    request('GET', '/backend/api' . $path, 401);
    request('GET', '/backend/api' . $path, 403, null, $admin);
}
request('GET', '/backend/api/area-manager/area', 409, null, $cookies['unassigned']);
check(request('GET', '/backend/api/area-manager/area', 200, null, $cookies['a'])['body']['data']['area_id'] === $areaA, 'Context uses authenticated assigned area');
$driver = ['full_name' => 'Scope driver', 'email' => 'scope-driver@areas.test', 'phone' => '0778877701',
    'password' => 'Areas-Test-Only!42', 'driving_license_no' => 'SCOPE-DRIVER', 'license_class' => 'B', 'license_expiry' => '2030-01-01',
    'area_id' => $areaB, 'registered_by' => $managers['b']];
$driverId = request('POST', '/backend/api/area-manager/delivery-personnel', 201, $driver, $cookies['a'])['body']['data']['user_id'];
$tech = ['full_name' => 'Scope tech', 'email' => 'scope-tech@areas.test', 'phone' => '0778877702',
    'password' => 'Areas-Test-Only!42', 'category_ids' => [$categoryId], 'years_experience' => 3, 'area_id' => $areaB, 'registered_by' => $managers['b']];
$techId = request('POST', '/backend/api/area-manager/technicians', 201, $tech, $cookies['a'])['body']['data']['user_id'];
foreach (['delivery_personnel' => $driverId, 'maintenance_techs' => $techId] as $table => $userId) {
    $row = $db->query("SELECT area_id, registered_by FROM $table WHERE user_id = $userId")->fetch();
    check((int) $row['area_id'] === $areaA && (int) $row['registered_by'] === $managers['a'], 'Staff inherits server area and registration identity');
}
$vehicleBody = ['plate_number' => 'WP-CAB-4455', 'vehicle_type' => 'lorry', 'max_load_kg' => 3000,
    'cargo_length_m' => '4.00', 'cargo_width_m' => '2.00', 'status' => 'available', 'managed_by' => $managers['b']];
$vehicle = request('POST', '/backend/api/area-manager/vehicles', 201, $vehicleBody, $cookies['a'])['body']['data'];
$vehicleId = $vehicle['vehicle_id'];
check($vehicle['area_id'] === $areaA && (int) $db->query("SELECT managed_by FROM vehicles WHERE vehicle_id = $vehicleId")->fetchColumn() === $managers['a'], 'Vehicle custody is session-derived');
foreach (['delivery-personnel' => $driverId, 'technicians' => $techId, 'vehicles' => $vehicleId] as $resource => $resourceId) {
    $path = '/backend/api/area-manager/' . $resource;
    $rows = request('GET', $path . '?area_id=' . $areaB, 200, null, $cookies['peer'])['body']['data'];
    check(count($rows) === 1 && (int) $rows[0]['area_id'] === $areaA, 'Same-area shared list; query cannot override authorization');
    request('GET', "$path/$resourceId", 200, null, $cookies['peer']);
    check(request('GET', $path, 200, null, $cookies['b'])['body']['data'] === [], 'Cross-area list empty');
    request('GET', "$path/$resourceId", 404, null, $cookies['b']);
    request('GET', "$path/$resourceId", 409, null, $cookies['unassigned']);
}
$vehiclePath = '/backend/api/area-manager/vehicles/' . $vehicleId;
request('PUT', $vehiclePath, 404, $vehicleBody, $cookies['b']);
request('DELETE', $vehiclePath, 404, [], $cookies['b']);
request('POST', $vehiclePath . '/restore', 404, [], $cookies['b']);
$vehicleBody['max_load_kg'] = 4000;
request('PUT', $vehiclePath, 200, $vehicleBody, $cookies['peer']);
request('PUT', $vehiclePath, 200, $vehicleBody, $cookies['peer']); // unchanged update
$badVehicle = $vehicleBody; $badVehicle['max_load_kg'] = -1;
request('PUT', $vehiclePath, 422, $badVehicle, $cookies['peer']);
request('POST', '/backend/api/area-manager/vehicles', 422, $vehicleBody, $cookies['peer']);
request('DELETE', $vehiclePath, 200, [], $cookies['peer']);
check((int) $db->query("SELECT COUNT(*) FROM vehicles WHERE vehicle_id = $vehicleId")->fetchColumn() === 1, 'Remove retains vehicle record');
request('POST', $vehiclePath . '/restore', 404, [], $cookies['b']);
request('POST', $vehiclePath . '/restore', 200, [], $cookies['peer']);
request('POST', $vehiclePath . '/restore', 409, [], $cookies['peer']);
$db->exec("UPDATE vehicles SET status = 'in_use', retired_at = CURRENT_TIMESTAMP WHERE vehicle_id = $vehicleId");
request('POST', $vehiclePath . '/restore', 409, [], $cookies['peer']);
$db->exec("UPDATE vehicles SET retired_at = NULL WHERE vehicle_id = $vehicleId");
$db->exec("UPDATE vehicles SET status = 'in_use' WHERE vehicle_id = $vehicleId");
request('DELETE', $vehiclePath, 409, [], $cookies['peer']);
request('PUT', $vehiclePath, 409, $vehicleBody, $cookies['peer']);
$db->exec("UPDATE vehicles SET status = 'available' WHERE vehicle_id = $vehicleId");
// Custodian reassignments cannot move vehicle history implicitly, even retired.
$custodianAssignment = '/backend/api/admin/area-managers/' . $managers['a'] . '/area';
request('PUT', $custodianAssignment, 409, ['area_id' => $areaB], $admin);
request('PUT', $custodianAssignment, 409, ['area_id' => null], $admin);
request('DELETE', $vehiclePath, 200, [], $cookies['peer']);
request('PUT', $custodianAssignment, 409, ['area_id' => $areaB], $admin);
check((int) $db->query('SELECT area_id FROM area_managers WHERE user_id = ' . $managers['a'])->fetchColumn() === $areaA, 'Custodian area preserved with vehicle history');
request('POST', $vehiclePath . '/restore', 200, [], $cookies['peer']);
// Reassigning a non-custodian revokes access immediately; staff do not follow.
$peerDriver = $driver;
$peerDriver['email'] = 'peer-driver@areas.test'; $peerDriver['phone'] = '0778877703'; $peerDriver['driving_license_no'] = 'PEER-DRIVER';
$peerDriverId = request('POST', '/backend/api/area-manager/delivery-personnel', 201, $peerDriver, $cookies['peer'])['body']['data']['user_id'];
$peerAssignment = '/backend/api/admin/area-managers/' . $managers['peer'] . '/area';
request('PUT', $peerAssignment, 200, ['area_id' => $areaB], $admin);
request('GET', '/backend/api/area-manager/delivery-personnel/' . $peerDriverId, 404, null, $cookies['peer']);
request('GET', '/backend/api/area-manager/delivery-personnel/' . $peerDriverId, 200, null, $cookies['a']);
check((int) $db->query("SELECT area_id FROM delivery_personnel WHERE user_id = $peerDriverId")->fetchColumn() === $areaA, 'Registered staff remain in original area after registrar reassignment');
foreach (['delivery-personnel' => $driverId, 'technicians' => $techId, 'vehicles' => $vehicleId] as $resource => $resourceId) {
    request('GET', "/backend/api/area-manager/$resource/$resourceId", 404, null, $cookies['peer']);
}
request('PUT', $peerAssignment, 200, ['area_id' => null], $admin);
request('GET', $vehiclePath, 409, null, $cookies['peer']);
request('PUT', $peerAssignment, 200, ['area_id' => $areaA], $admin);
request('GET', $vehiclePath, 200, null, $cookies['peer']);
// Explicitly unassigned legacy staff must never fall back to registered_by.
$db->exec("UPDATE delivery_personnel SET area_id = NULL WHERE user_id = $driverId");
request('GET', '/backend/api/area-manager/delivery-personnel/' . $driverId, 404, null, $cookies['a']);
$visibleDrivers = request('GET', '/backend/api/area-manager/delivery-personnel', 200, null, $cookies['peer'])['body']['data'];
check(count($visibleDrivers) === 1 && (int) $visibleDrivers[0]['user_id'] === $peerDriverId, 'Unassigned staff hidden from same-area managers');
$db->exec("UPDATE delivery_personnel SET area_id = $areaA WHERE user_id = $driverId");
$db->exec("UPDATE maintenance_techs SET area_id = NULL WHERE user_id = $techId");
request('GET', '/backend/api/area-manager/technicians/' . $techId, 404, null, $cookies['a']);
$db->exec("UPDATE maintenance_techs SET area_id = $areaA WHERE user_id = $techId");
// Legacy vehicle without an assigned custodian is inaccessible, not auto-adopted.
$unassignedManager = $managers['unassigned'];
$db->exec("INSERT INTO vehicles (managed_by, plate_number, vehicle_type, max_load_kg, cargo_length_m, cargo_width_m)
    VALUES ($unassignedManager, 'WP-CAB-8899', 'lorry', 1000, 4, 2)");
$legacyVehicle = (int) $db->lastInsertId();
request('GET', '/backend/api/area-manager/vehicles/' . $legacyVehicle, 404, null, $cookies['a']);
request('PUT', "/backend/api/admin/area-managers/$unassignedManager/area", 409, ['area_id' => $areaA], $admin);
// Deactivation revokes every operational endpoint without changing stored rows.
request('POST', "$base/$areaA/deactivate", 200, [], $admin);
foreach ($paths as $path) {
    request('GET', '/backend/api' . $path, 409, null, $cookies['a']);
    request('POST', '/backend/api' . $path, 409, [], $cookies['peer']);
}
request('GET', $vehiclePath, 409, null, $cookies['peer']);
request('PUT', $vehiclePath, 409, $vehicleBody, $cookies['peer']);
request('DELETE', $vehiclePath, 409, [], $cookies['peer']);
request('POST', $vehiclePath . '/restore', 409, [], $cookies['peer']);
request('POST', "$base/$areaA/activate", 200, [], $admin);
request('GET', $vehiclePath, 200, null, $cookies['peer']);
$db->exec('UPDATE users SET account_status = \'suspended\' WHERE user_id = ' . $managers['peer']);
request('GET', $vehiclePath, 409, null, $cookies['peer']);
$db->exec('UPDATE users SET account_status = \'active\' WHERE user_id = ' . $managers['peer']);
check((int) $db->query("SELECT registered_by FROM delivery_personnel WHERE user_id = $driverId")->fetchColumn() === $managers['a'], 'Registration history never changed');
check((int) $db->query('SELECT COUNT(*) FROM vehicles')->fetchColumn() === 2, 'All vehicle records retained');
foreach (['Delivery%20Personnel', 'Maintenance%20Technicians', 'Vehicles'] as $page) {
    $response = request('GET', '/frontend/Area%20Manager/' . $page . '/index.html', 200);
    check(strpos($response['raw'], 'area-resources.js') !== false && strpos($response['raw'], '<th>Area</th>') !== false, 'Area-aware page assets and columns');
}
echo 'PASS: ', $checks - $scopeStart, " area-scoping HTTP/regression checks; $checks total HTTP assertions.\n";
