<?php
/** CLI only. Creates uniquely named test databases; equipify is inspected read-only. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/ComplaintActionModel.php';
require_once __DIR__ . '/../models/LoginAttemptModel.php';
require_once __DIR__ . '/../models/VehicleModel.php';
require_once __DIR__ . '/../models/AreaManagerModel.php';
require_once __DIR__ . '/../models/DeliveryPersonnelModel.php';
require_once __DIR__ . '/../services/NotificationService.php';
require_once __DIR__ . '/../core/PasswordResetUrl.php';

$checks = 0;
function verify(bool $condition, string $label): void {
    global $checks;
    if (!$condition) throw new RuntimeException('FAILED: ' . $label);
    $checks++;
}
function rejected(callable $call, string $label): void {
    try { $call(); } catch (Throwable $e) { verify(true, $label); return; }
    throw new RuntimeException('FAILED: ' . $label);
}
function connection(string $name): PDO {
    return new PDO('mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . $name . ';charset=utf8mb4', DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
}
function complaintFingerprint(PDO $db): string {
    $db->exec('START TRANSACTION READ ONLY');
    try {
        $hash = hash('sha256', serialize($db->query('SELECT * FROM complaints ORDER BY complaint_id')->fetchAll()));
        $db->commit();
        return $hash;
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
}
function migrate(PDO $db, array $files): void {
    foreach ($files as $file) {
        try { $db->exec(file_get_contents($file)); }
        catch (Throwable $e) { throw new RuntimeException(basename($file) . ': ' . $e->getMessage(), 0, $e); }
    }
}

$source = connection('equipify');
$before = complaintFingerprint($source);
$suffix = gmdate('Ymd_His') . '_' . bin2hex(random_bytes(3));
$freshName = 'equipify_week1_test_' . $suffix;
$upgradeName = 'equipify_week1_upgrade_' . $suffix;
// CREATE without IF NOT EXISTS guarantees no preexisting database is reused.
$source->exec("CREATE DATABASE `$freshName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$source->exec("CREATE DATABASE `$upgradeName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
putenv('EQUIPIFY_DB_NAME=' . $freshName);
$db = getDbConnection();
verify($db->query('SELECT DATABASE()')->fetchColumn() === $freshName, 'Isolated test connection');
$files = glob(__DIR__ . '/../../schema/[0-9][0-9][0-9]_*.sql');
sort($files);
$files = array_values(array_filter($files, static fn($f) => substr(basename($f), 0, 3) !== '000'));
migrate($db, $files);
echo 'PASS: ', count($files), " ordered migrations on fresh database $freshName\n";

// Clone definitions only, never local application records. Run only unapplied
// Week 1 migrations; 031 is a fresh-database definition and must be skipped.
$upgrade = connection($upgradeName);
$upgrade->exec('SET FOREIGN_KEY_CHECKS = 0');
$source->exec('START TRANSACTION READ ONLY');
try {
    foreach ($source->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        $definition = $source->query('SHOW CREATE TABLE `' . str_replace('`', '``', $table) . '`')->fetch(PDO::FETCH_NUM)[1];
        $upgrade->exec($definition);
    }
    $source->commit();
} catch (Throwable $e) { $source->rollBack(); throw $e; }
$upgrade->exec('SET FOREIGN_KEY_CHECKS = 1');
$upgrade->exec("INSERT INTO users (email, password_hash, role, full_name, phone)
    VALUES ('upgrade-admin@week1.test', 'synthetic-only', 'admin', 'Upgrade admin', '0779000001')");
$legacyAdmin = (int) $upgrade->lastInsertId();
$upgrade->exec("INSERT INTO admins (user_id) VALUES ($legacyAdmin)");
$upgrade->exec("INSERT INTO users (email, password_hash, role, full_name, phone)
    VALUES ('upgrade-manager@week1.test', 'synthetic-only', 'area_manager', 'Upgrade manager', '0779000002')");
$legacyManager = (int) $upgrade->lastInsertId();
$upgrade->exec("INSERT INTO area_managers (user_id, registered_by) VALUES ($legacyManager, $legacyAdmin)");
$upgrade->exec("INSERT INTO users (email, password_hash, role, full_name, phone)
    VALUES ('upgrade-customer@week1.test', 'synthetic-only', 'customer', 'Upgrade customer', '0779000003')");
$legacyCustomer = (int) $upgrade->lastInsertId();
$upgrade->exec("INSERT INTO complaints (complainant_id, complainant_role, against_role, category, subject, description)
    VALUES ($legacyCustomer, 'customer', 'renting_party', 'Other', 'Preserve me', 'Synthetic legacy complaint')");
$legacyComplaintBefore = complaintFingerprint($upgrade);
$existingTables = $upgrade->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
$areaColumns = 0;
foreach (['area_managers', 'delivery_personnel', 'maintenance_techs'] as $table) {
    foreach ($upgrade->query('DESCRIBE ' . $table)->fetchAll() as $column) {
        if ($column['Field'] === 'area_id') $areaColumns++;
    }
}
if ($areaColumns !== 0 && $areaColumns !== 3) throw new RuntimeException('Partial 030 application needs manual review.');
$needed = [];
foreach (['029' => 'areas', '032' => 'complaint_actions', '033' => 'notifications', '034' => 'login_attempts', '035' => 'deliveries'] as $number => $table) {
    if (!in_array($table, $existingTables, true)) $needed[] = (string) $number;
}
if ($areaColumns === 0) $needed[] = '030';
$pending = array_values(array_filter($files, static fn($f) => in_array(substr(basename($f), 0, 3), $needed, true)));
migrate($upgrade, $pending);
verify(complaintFingerprint($upgrade) === $legacyComplaintBefore, 'Upgrade preserves existing complaint records and statuses');
verify($upgrade->query("SELECT area_id FROM area_managers WHERE user_id = $legacyManager")->fetchColumn() === null, 'Upgrade keeps legacy personnel unassigned');
verify($db->query('DESCRIBE complaints')->fetchAll() === $upgrade->query('DESCRIBE complaints')->fetchAll(), 'Fresh and existing complaints columns agree');
echo "PASS: pending Week 1 migrations on local-schema-only clone $upgradeName\n";

$users = [];
$i = 0;
foreach (['admin','area_manager','delivery_personnel','customer','renting_party','maintenance_tech','freelance_worker'] as $role) {
    $users[$role] = UserModel::insert(['email' => $role . '@week1.test', 'password_hash' => password_hash('Week1-Test-Only!42', PASSWORD_DEFAULT),
        'role' => $role, 'full_name' => 'Week 1 ' . $role, 'phone' => '077000000' . ++$i, 'address_line' => null, 'district' => 'Colombo']);
}
$admin = $users['admin']; $manager = $users['area_manager']; $driver = $users['delivery_personnel'];
$db->exec("INSERT INTO admins (user_id) VALUES ($admin)");
AreaManagerModel::insert($manager, $admin);
DeliveryPersonnelModel::insert($driver, $manager, ['driving_license_no' => 'W1-TEST', 'license_class' => 'B', 'license_expiry' => '2030-01-01']);
verify(count(AreaManagerModel::all()) === 1 && count(DeliveryPersonnelModel::allForManager($manager)) === 1, 'Existing personnel models retain compatibility');
verify($db->query("SELECT area_id FROM delivery_personnel WHERE user_id = $driver")->fetchColumn() === null, 'Legacy registration remains unassigned');
$db->exec("INSERT INTO areas (name) VALUES ('Test region')");
$area = (int) $db->lastInsertId();
$db->exec("UPDATE area_managers SET area_id = $area WHERE user_id = $manager");
$db->exec("UPDATE delivery_personnel SET area_id = $area WHERE user_id = $driver");
rejected(static fn() => $db->exec("DELETE FROM areas WHERE area_id = $area"), 'Assigned area deletion restricted');
$db->exec("INSERT INTO vehicles (managed_by, plate_number, vehicle_type, max_load_kg, cargo_length_m, cargo_width_m)
    VALUES ($manager, 'W1-TEST', 'lorry', 1000, 4, 2)");
$vehicle = (int) $db->lastInsertId();
verify(VehicleModel::findForManager($vehicle, $manager) !== null, 'Existing vehicle model compatible');
$db->exec("INSERT INTO deliveries (area_id, assigned_by, delivery_personnel_id, vehicle_id, pickup_address, delivery_address)
    VALUES ($area, $manager, $driver, $vehicle, 'Pickup', 'Destination')");
$delivery = (int) $db->lastInsertId();
rejected(static fn() => $db->exec("DELETE FROM vehicles WHERE vehicle_id = $vehicle"), 'Delivery history prevents vehicle deletion');
$db->exec("INSERT INTO delivery_actions (delivery_id, actor_user_id, new_status, description) VALUES ($delivery, $manager, 'pending', 'Created')");
rejected(static fn() => $db->exec("DELETE FROM deliveries WHERE delivery_id = $delivery"), 'Delivery audit history retained');
rejected(static fn() => $db->exec("INSERT INTO delivery_actions (delivery_id, new_status, description) VALUES (999999, 'pending', 'Invalid')"), 'Delivery action FK enforced');

$id = ComplaintModel::insert($users['customer'], 'customer', $users['renting_party'],
    ['category' => 'Payment / Billing', 'subject' => 'Week 1 fixture', 'description' => 'Synthetic complaint'], null);
verify(ComplaintModel::find($id)['status'] === 'open', 'Existing complaint insert defaults to open');
verify(ComplaintModel::listing($users['customer'], '', 'open', 'Payment / Billing', 'created_at', 'desc', 1, 10)['total'] === 1, 'Complaint filters and owner scope');
ComplaintActionModel::changeStatus($id, 'under_review', $admin);
ComplaintActionModel::changeStatus($id, 'under_review', $admin);
verify((int) $db->query('SELECT COUNT(*) FROM complaint_actions')->fetchColumn() === 1, 'Repeated status does not duplicate history');
rejected(static fn() => ComplaintActionModel::changeStatus($id, 'resolved', 999999), 'Invalid audit actor rolls back transition');
verify(ComplaintModel::find($id)['status'] === 'under_review', 'Status rolled back with failed audit');
ComplaintActionModel::changeStatus($id, 'resolved', $admin);
ComplaintActionModel::changeStatus($id, 'open', $admin);
verify(ComplaintModel::find($id)['status'] === 'open', 'All existing status updates retained');
$db->beginTransaction();
ComplaintActionModel::changeStatus($id, 'resolved', $admin);
$db->rollBack();
verify(ComplaintModel::find($id)['status'] === 'open', 'Audit respects caller transaction');
rejected(static fn() => $db->exec("UPDATE complaints SET against_role = 'maintenance_tech' WHERE complaint_id = $id"), 'Complaint role CHECK enforced');

$notification = NotificationService::notify($users['customer'], 'complaint', 'Update', 'Review started', '/frontend/Customer/Complaints/index.html');
verify(NotificationModel::listing($users['customer'], 1, 10, true)['total'] === 1, 'Notification persisted and listed');
verify(NotificationModel::markRead($driver, $notification['notification_id']) === 0, 'Other user cannot mark notification');
verify(NotificationModel::markRead($users['customer'], $notification['notification_id']) === 1, 'Owner can mark notification');
verify(NotificationModel::markRead($users['customer'], $notification['notification_id']) === 0, 'Read action idempotent');
verify(NotificationModel::listing($users['customer'], 1, 10, true)['total'] === 0, 'Unread filter');
foreach (['javascript:alert(1)', '//evil.test', '/%2fevil.test', '/\\evil.test', '/%0aevil'] as $link) {
    rejected(static fn() => NotificationService::notify($driver, 'test', 'Title', 'Body', $link), 'Unsafe notification link');
}
verify(!LoginAttemptModel::blocked('rate@week1.test', '127.0.0.10'), 'Initial login allowed');
for ($n = 0; $n < 5; $n++) LoginAttemptModel::record('rate@week1.test', null, false, '127.0.0.10', 'invalid_credentials');
verify(LoginAttemptModel::blocked('rate@week1.test', '127.0.0.11'), 'Account throttled across IPs');
verify(!LoginAttemptModel::blocked('other@week1.test', '127.0.0.10'), 'Other account below IP threshold');
for ($n = 0; $n < 25; $n++) LoginAttemptModel::record('ip' . $n . '@week1.test', null, false, '127.0.0.10', 'invalid_credentials');
verify(LoginAttemptModel::blocked('new@week1.test', '127.0.0.10'), 'IP throttled across identifiers');
$db->exec('UPDATE login_attempts SET attempted_at = CURRENT_TIMESTAMP - INTERVAL 16 MINUTE');
verify(!LoginAttemptModel::blocked('rate@week1.test', '127.0.0.10'), 'Throttle expires');
LoginAttemptModel::record('success@week1.test', $admin, true, '127.0.0.10', null);
verify(!LoginAttemptModel::blocked('success@week1.test', '127.0.0.10'), 'Success does not count as failure');

$token = str_repeat('a', 64);
foreach (['https://equipify.example/reset', 'http://localhost/equipify/reset'] as $base) {
    putenv('EQUIPIFY_PASSWORD_RESET_URL=' . $base);
    $_SERVER['HTTP_HOST'] = 'attacker.test'; $_SERVER['HTTP_X_FORWARDED_HOST'] = 'attacker.test';
    verify(PasswordResetUrl::build($token) === $base . '?token=' . $token, 'Reset URL ignores request host');
}
foreach (['', '//evil.test/reset', 'http://equipify.example/reset', 'https://user:pass@example.test/reset', 'https://example.test/reset?next=evil', "https://example.test/\r\nHeader:bad", 'https://example.test/#fragment'] as $base) {
    putenv('EQUIPIFY_PASSWORD_RESET_URL=' . $base);
    rejected(static fn() => PasswordResetUrl::build($token), 'Unsafe reset configuration rejected');
}
rejected(static fn() => PasswordResetUrl::build('untrusted&token'), 'Malformed token rejected');
foreach (['complaints_test.php','complaints_controller_test.php'] as $test) {
    passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/' . $test) . ($test === 'complaints_test.php' ? ' --database' : ''), $exit);
    verify($exit === 0, $test);
}
verify(complaintFingerprint($source) === $before, 'Local equipify complaints unchanged');
echo "PASS: $checks Week 1 integration/security checks.\n";
echo "TEST_DATABASE=$freshName\nUPGRADE_DATABASE=$upgradeName\n";
echo "Synthetic test databases retained for API checks; no application database migrations executed.\n";
