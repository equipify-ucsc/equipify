<?php
/**
 * SQL for the `users` table. Only place that reads/writes it.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class UserModel
{
    /** @return array<string,mixed>|null */
    public static function findByEmail(string $email): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT user_id, email, password_hash, role, full_name, account_status
               FROM users WHERE email = :email LIMIT 1'
        );
        $stmt->execute([':email' => $email]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return array<string,mixed>|null */
    public static function findById(int $userId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT user_id, email, role, full_name, phone, district, account_status
               FROM users WHERE user_id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public static function emailExists(string $email): bool
    {
        $stmt = getDbConnection()->prepare('SELECT 1 FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        return $stmt->fetchColumn() !== false;
    }

    public static function phoneExists(string $phone): bool
    {
        $stmt = getDbConnection()->prepare('SELECT 1 FROM users WHERE phone = :phone LIMIT 1');
        $stmt->execute([':phone' => $phone]);
        return $stmt->fetchColumn() !== false;
    }

    /**
     * Inserts a base account row and returns the new user_id. Does not manage a
     * transaction: the caller (a service) wraps this with the subtype insert.
     *
     * @param array{email:string,password_hash:string,role:string,full_name:string,phone:string,address_line:?string,district:?string} $u
     */
    public static function insert(array $u): int
    {
        $db = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO users (email, password_hash, role, full_name, phone, address_line, district)
             VALUES (:email, :password_hash, :role, :full_name, :phone, :address_line, :district)'
        );
        $stmt->execute([
            ':email'         => $u['email'],
            ':password_hash' => $u['password_hash'],
            ':role'          => $u['role'],
            ':full_name'     => $u['full_name'],
            ':phone'         => $u['phone'],
            ':address_line'  => $u['address_line'],
            ':district'      => $u['district'],
        ]);
        return (int) $db->lastInsertId();
    }

    public static function touchLastLogin(int $userId): void
    {
        $stmt = getDbConnection()->prepare('UPDATE users SET last_login_at = NOW() WHERE user_id = :id');
        $stmt->execute([':id' => $userId]);
    }

    public static function updatePasswordHash(int $userId, string $hash): void
    {
        $stmt = getDbConnection()->prepare('UPDATE users SET password_hash = :h WHERE user_id = :id');
        $stmt->execute([':h' => $hash, ':id' => $userId]);
    }
}
