<?php
/**
 * Creates the first admin account (there is no sign-up page for admins).
 *
 *   php backend/tools/create_admin.php "Full Name" admin@equipify.lk 0771234567 "Password123"
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("CLI only.\n");
}

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../core/Validator.php';
require_once __DIR__ . '/../models/UserModel.php';

if ($argc !== 5) {
    exit("Usage: php create_admin.php \"Full Name\" email phone password\n");
}
[, $name, $email, $phoneRaw, $password] = $argv;
$email = strtolower(trim($email));
$phone = Validator::normalizePhone($phoneRaw);

if (Validator::email($email) !== null || $phone === null || Validator::password($password) !== null || trim($name) === '') {
    exit("Invalid name, email, phone or password (8+ chars with a letter and a number).\n");
}
if (UserModel::emailExists($email) || UserModel::phoneExists($phone)) {
    exit("An account with that email or phone already exists.\n");
}

$db = getDbConnection();
$db->beginTransaction();
$userId = UserModel::insert([
    'email'         => $email,
    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    'role'          => 'admin',
    'full_name'     => trim($name),
    'phone'         => $phone,
    'address_line'  => null,
    'district'      => null,
]);
$db->prepare('INSERT INTO admins (user_id) VALUES (:id)')->execute([':id' => $userId]);
$db->commit();
echo "Admin created (user_id $userId).\n";
