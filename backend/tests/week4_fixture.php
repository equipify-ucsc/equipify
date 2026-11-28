<?php
/** Synthetic logistics only; no rental/payment/agreement events or outgoing email. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require_once __DIR__ . '/../config/db_config.php';
function week4Safety(): void
{
    if ((int) getenv('EQUIPIFY_DB_PORT') !== 13307
        || in_array(strtolower((string) getenv('EQUIPIFY_ENV')), ['prod', 'production'], true)
        || in_array(strtolower((string) getenv('APP_ENV')), ['prod', 'production'], true)) {
        throw new RuntimeException('Week 4 tests require isolated port 13307 and a non-production environment.');
    }
    putenv('EQUIPIFY_MAIL_ENABLE_SEND=0');
}
function week4Fixture(): array
{
    week4Safety();
    $server = new PDO('mysql:host=127.0.0.1;port=13307;charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    if (!str_contains(str_replace('\\', '/', strtolower($server->query('SELECT @@datadir')->fetchColumn())), '/tmp/')) throw new RuntimeException('Expected isolated temporary datadir.');
    $name = 'equipify_week4_test_' . gmdate('Ymd_His') . '_' . bin2hex(random_bytes(4));
    $server->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    putenv('EQUIPIFY_DB_NAME=' . $name); $db = getDbConnection();
    if ($db->query('SELECT DATABASE()')->fetchColumn() !== $name) throw new RuntimeException('Isolation failed.');
    foreach (glob(__DIR__ . '/../../schema/[0-9][0-9][0-9]_*.sql') as $file) if (substr(basename($file), 0, 3) !== '000') $db->exec(file_get_contents($file));
    $ids = []; $phone = 0;
    $hash = password_hash('Week4-Test-Only!42', PASSWORD_DEFAULT);
    foreach (['admin','area_manager','customer','renting_party','freelance_worker','delivery_personnel','maintenance_tech',
        'manager_peer','manager_foreign','driver_two','driver_foreign','driver_busy','driver_expired','driver_suspended'] as $key) {
        $role = str_starts_with($key, 'manager_') ? 'area_manager' : (str_starts_with($key, 'driver_') ? 'delivery_personnel' : $key);
        $stmt = $db->prepare('INSERT INTO users(email,password_hash,role,full_name,phone) VALUES(?,?,?,?,?)');
        $stmt->execute([$key . '@week4.test', $hash, $role, 'Synthetic ' . $key, '077990' . str_pad((string) ++$phone, 4, '0', STR_PAD_LEFT)]);
        $ids[$key] = (int) $db->lastInsertId();
    }
    $db->exec('INSERT INTO admins(user_id) VALUES (' . $ids['admin'] . ')');
    $db->exec("INSERT INTO areas(name) VALUES ('Week 4 synthetic A'), ('Week 4 synthetic B')");
    foreach (['area_manager','manager_peer','manager_foreign'] as $key) {
        $stmt = $db->prepare('INSERT INTO area_managers(user_id,registered_by,area_id) VALUES(?,?,?)');
        $stmt->execute([$ids[$key], $ids['admin'], $key === 'manager_foreign' ? 2 : 1]);
    }
    foreach (['delivery_personnel','driver_two','driver_foreign','driver_busy','driver_expired','driver_suspended'] as $key) {
        $stmt = $db->prepare('INSERT INTO delivery_personnel(user_id,registered_by,area_id,driving_license_no,license_class,license_expiry,availability_status) VALUES(?,?,?,?,?,?,?)');
        $stmt->execute([$ids[$key], $ids['area_manager'], $key === 'driver_foreign' ? 2 : 1, 'W4-' . $ids[$key], 'B',
            $key === 'driver_expired' ? '2020-01-01' : '2099-12-31', $key === 'driver_busy' ? 'busy' : 'available']);
    }
    $db->exec("UPDATE users SET account_status='suspended' WHERE user_id=" . $ids['driver_suspended']);
    $vehicles=[];
    foreach (['first','peer','foreign','maintenance','retired','orphan'] as $index=>$key) {
        $stmt=$db->prepare('INSERT INTO vehicles(managed_by,plate_number,vehicle_type,max_load_kg,cargo_length_m,cargo_width_m,status,retired_at) VALUES(?,?,?,?,?,?,?,?)');
        $stmt->execute([$ids[$key==='foreign'?'manager_foreign':($key==='peer'?'manager_peer':'area_manager')],
            'W4-VAN-'.($index+1),'van',500,2,1.5,$key==='maintenance'?'maintenance':($key==='orphan'?'in_use':'available'),$key==='retired'?'2026-01-01 00:00:00':null]);
        $vehicles[$key]=(int)$db->lastInsertId();
    }
    return ['database' => $name, 'ids' => $ids, 'vehicles'=>$vehicles];
}
function week4Delivery(int $manager, int $area = 1, string $status = 'pending'): int
{
    $db = getDbConnection();
    $stmt = $db->prepare('INSERT INTO deliveries(area_id,assigned_by,related_reference,pickup_address,delivery_address,status) VALUES(?,?,?,?,?,?)');
    $stmt->execute([$area, $manager, 'SYNTHETIC-W4', 'Synthetic pickup, Colombo', 'Synthetic destination, Colombo', $status]);
    return (int) $db->lastInsertId();
}
