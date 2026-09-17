<?php
/**
 * Database connection for the Equipify backend.
 *
 * Every PHP file that needs the database includes this file and calls
 * getDbConnection() instead of creating its own PDO instance:
 *
 *     require_once __DIR__ . '/../config/db_config.php';
 *     $db = getDbConnection();
 *
 * The values below are XAMPP's defaults and this file is committed to git.
 * If your local MySQL uses a different user or password, change it locally
 * but NEVER commit a real password.
 */

declare(strict_types=1);

const DB_HOST    = '127.0.0.1';
const DB_PORT    = 3306;
const DB_NAME    = 'equipify';
const DB_USER    = 'root';
const DB_PASS    = '';
const DB_CHARSET = 'utf8mb4';

/**
 * Returns the shared PDO connection, opening it on first use.
 *
 * The session is set to strict SQL mode (so invalid ENUM values and bad data
 * raise errors instead of being silently changed, even on XAMPP's MariaDB)
 * and to Sri Lanka time (+05:30) so TIMESTAMP columns and NOW() match local
 * time.
 *
 * @throws RuntimeException if the connection cannot be opened. The real
 *         cause is written to the PHP error log, not exposed to the caller.
 */
function getDbConnection(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        DB_HOST,
        DB_PORT,
        DB_NAME,
        DB_CHARSET
    );

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::MYSQL_ATTR_INIT_COMMAND =>
            "SET SESSION sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,"
            . "NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,"
            . "NO_ENGINE_SUBSTITUTION', time_zone = '+05:30'",
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $e) {
        error_log('Equipify DB connection failed: ' . $e->getMessage());
        throw new RuntimeException('Database connection failed.');
    }

    return $pdo;
}
