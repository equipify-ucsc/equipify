<?php
/** Creates an isolated fixture database; never selects or writes equipify. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../models/AreaModel.php';
require_once __DIR__ . '/../models/UserModel.php';
$name = 'equipify_areas_test_' . gmdate('Ymd_His') . '_' . bin2hex(random_bytes(4));
$server = new PDO('mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4', DB_USER, DB_PASS,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$server->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
putenv('EQUIPIFY_DB_NAME=' . $name);
$db = getDbConnection();
if ($db->query('SELECT DATABASE()')->fetchColumn() !== $name) throw new RuntimeException('Database isolation failed.');
foreach (['001_create_users.sql','002_create_admins.sql','003_add_users_status_changed_by_fk.sql',
    '007_create_area_managers.sql','008_create_maintenance_techs.sql','009_create_delivery_personnel.sql',
    '013_create_vehicles.sql','018_create_equipment_categories.sql','026_create_maintenance_tech_categories.sql',
    '029_create_areas.sql','030_add_area_ids_to_personnel.sql','034_create_login_attempts.sql'] as $migration) {
    $db->exec(file_get_contents(__DIR__ . '/../../schema/' . $migration));
}
$i = 0;
foreach (['admin','area_manager','customer','renting_party','delivery_personnel','maintenance_tech','freelance_worker'] as $role) {
    $id = UserModel::insert(['email' => $role . '@areas.test', 'password_hash' => password_hash('Areas-Test-Only!42', PASSWORD_DEFAULT),
        'role' => $role, 'full_name' => 'Areas test ' . $role, 'phone' => '077880000' . ++$i,
        'address_line' => null, 'district' => 'Colombo']);
    if ($role === 'admin') $db->exec("INSERT INTO admins (user_id) VALUES ($id)");
}
$id = AreaModel::insert('Model fixture', null);
if (AreaModel::find($id)['description'] !== null || !AreaModel::nameExists('MODEL FIXTURE')) throw new RuntimeException('Model persistence/collation failed.');
try { AreaModel::insert('model fixture', null); throw new RuntimeException('Unique name constraint missing.'); }
catch (PDOException $e) { if ((int) ($e->errorInfo[1] ?? 0) !== 1062) throw $e; }
AreaModel::update($id, 'Updated fixture', 'Description');
AreaModel::setActive($id, false);
AreaModel::setActive($id, false);
if ((int) AreaModel::find($id)['is_active'] !== 0) throw new RuntimeException('Model status failed.');
echo "PASS: existing migrations and area model persistence/uniqueness/status checks.\nTEST_DATABASE=$name\n";
