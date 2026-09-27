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

    // ------------------------------------------------------------ admin views

    /** Sortable columns for the admin user list, keyed by the ?sort= value. */
    private const ADMIN_SORTS = [
        'role'   => 'u.role',
        'status' => 'u.account_status',
    ];

    /**
     * One page of every non-admin account for the admin's user list. The
     * filters are already checked against the column enums by the controller,
     * and $sort/$dir only ever pick from ADMIN_SORTS and ASC/DESC.
     *
     * @param array{q?:string,role?:string,status?:string} $filters
     * @return array<int,array<string,mixed>>
     */
    public static function pageForAdmin(array $filters, string $sort, string $dir, int $limit, int $offset): array
    {
        [$where, $bind] = self::adminConditions($filters);
        $order = isset(self::ADMIN_SORTS[$sort])
            ? self::ADMIN_SORTS[$sort] . ($dir === 'desc' ? ' DESC' : ' ASC') . ', u.created_at DESC'
            : 'u.created_at DESC';

        $stmt = getDbConnection()->prepare(
            'SELECT u.user_id, u.full_name, u.email, u.role, u.account_status,
                    u.status_reason, u.created_at, rp.business_name
               FROM users u
               LEFT JOIN renting_parties rp ON rp.user_id = u.user_id
              ' . $where . '
              ORDER BY ' . $order . ', u.user_id DESC
              LIMIT ' . $limit . ' OFFSET ' . $offset
        );
        $stmt->execute($bind);
        return $stmt->fetchAll();
    }

    /** @param array{q?:string,role?:string,status?:string} $filters */
    public static function countForAdmin(array $filters): int
    {
        [$where, $bind] = self::adminConditions($filters);
        $stmt = getDbConnection()->prepare(
            'SELECT COUNT(*) FROM users u
               LEFT JOIN renting_parties rp ON rp.user_id = u.user_id ' . $where
        );
        $stmt->execute($bind);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Shared WHERE clause so the admin page query and its count never drift.
     * Admin accounts are never listed: one admin can't suspend another here.
     *
     * @param array{q?:string,role?:string,status?:string} $filters
     * @return array{0:string,1:array<string,mixed>}
     */
    private static function adminConditions(array $filters): array
    {
        $where = ["u.role <> 'admin'"];
        $bind  = [];

        if (($filters['q'] ?? '') !== '') {
            $where[] = '(u.full_name LIKE :q1 OR u.email LIKE :q2 OR rp.business_name LIKE :q3)';
            $like = '%' . $filters['q'] . '%';
            $bind[':q1'] = $like;
            $bind[':q2'] = $like;
            $bind[':q3'] = $like;
        }
        if (($filters['role'] ?? '') !== '') {
            $where[] = 'u.role = :role';
            $bind[':role'] = $filters['role'];
        }
        if (($filters['status'] ?? '') !== '') {
            $where[] = 'u.account_status = :status';
            $bind[':status'] = $filters['status'];
        }

        return ['WHERE ' . implode(' AND ', $where), $bind];
    }

    /**
     * An admin's account decision. Login and /auth/me already refuse any
     * account that isn't 'active', so this takes effect on the user's next
     * request. Returning to 'active' clears the reason.
     */
    public static function setAccountStatus(int $userId, string $status, ?string $reason, int $adminId): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE users
                SET account_status    = :status,
                    status_reason     = :reason,
                    status_changed_by = :admin,
                    status_changed_at = NOW()
              WHERE user_id = :id'
        );
        $stmt->execute([
            ':status' => $status,
            ':reason' => $status === 'active' ? null : $reason,
            ':admin'  => $adminId,
            ':id'     => $userId,
        ]);
    }

    /** @return array<string,mixed>|null the row the admin user list shows */
    public static function findForAdmin(int $userId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT u.user_id, u.full_name, u.email, u.role, u.account_status,
                    u.status_reason, u.created_at, rp.business_name
               FROM users u
               LEFT JOIN renting_parties rp ON rp.user_id = u.user_id
              WHERE u.user_id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }
}
