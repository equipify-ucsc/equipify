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
     * @param array{email:string,password_hash:string,role:string,full_name:string,phone:string,address_line:?string,district:?string,nic_number?:?string} $u
     *        nic_number is optional; roles whose sign-up does not ask for it omit the key.
     */
    public static function insert(array $u): int
    {
        $db = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO users (email, password_hash, role, full_name, phone, address_line, district, nic_number)
             VALUES (:email, :password_hash, :role, :full_name, :phone, :address_line, :district, :nic_number)'
        );
        $stmt->execute([
            ':email'         => $u['email'],
            ':password_hash' => $u['password_hash'],
            ':role'          => $u['role'],
            ':full_name'     => $u['full_name'],
            ':phone'         => $u['phone'],
            ':address_line'  => $u['address_line'],
            ':district'      => $u['district'],
            ':nic_number'    => $u['nic_number'] ?? null,
        ]);
        return (int) $db->lastInsertId();
    }

    public static function touchLastLogin(int $userId): void
    {
        $stmt = getDbConnection()->prepare('UPDATE users SET last_login_at = NOW() WHERE user_id = :id');
        $stmt->execute([':id' => $userId]);
    }

    public static function nicExists(string $nic): bool
    {
        $stmt = getDbConnection()->prepare('SELECT 1 FROM users WHERE nic_number = :nic LIMIT 1');
        $stmt->execute([':nic' => $nic]);
        return $stmt->fetchColumn() !== false;
    }

    /**
     * The account fields a signed-in user may edit about themselves. Role,
     * email and account_status are not here on purpose: changing those is not
     * a self-service action.
     *
     * @param array{full_name:string,phone:string,nic_number:?string,address_line:?string,district:?string} $u
     */
    public static function updateProfile(int $userId, array $u): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE users
                SET full_name    = :full_name,
                    phone        = :phone,
                    nic_number   = :nic_number,
                    address_line = :address_line,
                    district     = :district
              WHERE user_id = :id'
        );
        $stmt->execute([
            ':full_name'    => $u['full_name'],
            ':phone'        => $u['phone'],
            ':nic_number'   => $u['nic_number'],
            ':address_line' => $u['address_line'],
            ':district'     => $u['district'],
            ':id'           => $userId,
        ]);
    }

    /** True when another account already uses this phone number. */
    public static function phoneTakenByOther(string $phone, int $userId): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM users WHERE phone = :phone AND user_id <> :id LIMIT 1'
        );
        $stmt->execute([':phone' => $phone, ':id' => $userId]);
        return $stmt->fetchColumn() !== false;
    }

    /** True when another account already uses this NIC number. */
    public static function nicTakenByOther(string $nic, int $userId): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM users WHERE nic_number = :nic AND user_id <> :id LIMIT 1'
        );
        $stmt->execute([':nic' => $nic, ':id' => $userId]);
        return $stmt->fetchColumn() !== false;
    }

    public static function updatePasswordHash(int $userId, string $hash): void
    {
        $stmt = getDbConnection()->prepare('UPDATE users SET password_hash = :h WHERE user_id = :id');
        $stmt->execute([':h' => $hash, ':id' => $userId]);
    }

    /**
     * Every `users` column a profile page shows about its own account.
     *
     * @return array<string,mixed>|null
     */
    public static function findAccount(int $userId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT user_id, email, role, full_name, phone, nic_number,
                    address_line, district, profile_photo_url, account_status,
                    last_login_at, created_at
               FROM users WHERE user_id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** The stored profile photo path (relative to storage/), or null when there is none. */
    public static function profilePhotoPath(int $userId): ?string
    {
        $stmt = getDbConnection()->prepare('SELECT profile_photo_url FROM users WHERE user_id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $path = $stmt->fetchColumn();
        return $path === false || $path === null || $path === '' ? null : (string) $path;
    }

    /** Sets (or with null clears) the profile photo path. */
    public static function setProfilePhoto(int $userId, ?string $path): void
    {
        $stmt = getDbConnection()->prepare('UPDATE users SET profile_photo_url = :p WHERE user_id = :id');
        $stmt->execute([':p' => $path, ':id' => $userId]);
    }
}
