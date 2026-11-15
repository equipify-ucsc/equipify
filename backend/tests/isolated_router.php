<?php
if (PHP_SAPI !== 'cli-server') exit;
$name = getenv('EQUIPIFY_DB_NAME') ?: '';
if (!preg_match('/\Aequipify_week1_test_[a-z0-9_]+\z/', $name)) exit;
$sessions = __DIR__ . '/../../tmp/admin-users-sessions';
if (!is_dir($sessions)) mkdir($sessions, 0700, true);
session_save_path($sessions);
header('X-Equipify-Test-Database: ' . $name);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/backend/api/')) {
    $_SERVER['SCRIPT_NAME'] = '/backend/api/index.php';
    require __DIR__ . '/../api/index.php';
} else {
    $root = realpath(__DIR__ . '/../../frontend');
    $file = realpath(__DIR__ . '/../..' . rawurldecode($path));
    if ($file && str_starts_with($file, $root . DIRECTORY_SEPARATOR) && is_file($file) && in_array(strtolower(pathinfo($file, PATHINFO_EXTENSION)), ['html','js','css','png','jpg','svg','woff2','pdf'], true)) {
        $types = ['html'=>'text/html','js'=>'application/javascript','css'=>'text/css','png'=>'image/png','jpg'=>'image/jpeg','svg'=>'image/svg+xml','woff2'=>'font/woff2','pdf'=>'application/pdf'];
        header('Content-Type: ' . $types[strtolower(pathinfo($file, PATHINFO_EXTENSION))]); readfile($file);
    } else http_response_code(404);
}
