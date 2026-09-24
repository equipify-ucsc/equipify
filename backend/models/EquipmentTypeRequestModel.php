<?php
/**
 * SQL for `equipment_type_requests`: renting parties asking the admin to add
 * an equipment type the catalogue doesn't have yet.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class EquipmentTypeRequestModel
{
    private const SELECT =
        'SELECT r.request_id, r.requested_by, r.category_id, r.proposed_name, r.reason,
                r.status, r.resolved_type_id, r.admin_note, r.reviewed_at, r.created_at,
                c.name AS category_name, rp.business_name, t.name AS resolved_type_name
           FROM equipment_type_requests r
           JOIN equipment_categories c ON c.category_id = r.category_id
           JOIN renting_parties rp     ON rp.user_id = r.requested_by
      LEFT JOIN equipment_types t      ON t.type_id = r.resolved_type_id';

    /** @return array<int,array<string,mixed>> a renting party's own requests, newest first */
    public static function forRequester(int $userId): array
    {
        $stmt = getDbConnection()->prepare(
            self::SELECT . ' WHERE r.requested_by = :user_id ORDER BY r.created_at DESC, r.request_id DESC LIMIT 20'
        );
        $stmt->execute([':user_id' => $userId]);
        return $stmt->fetchAll();
    }

    /** Whether this party already has a pending request with this name in this category. */
    public static function pendingExists(int $userId, int $categoryId, string $name): bool
    {
        $stmt = getDbConnection()->prepare(
            "SELECT 1 FROM equipment_type_requests
              WHERE requested_by = :user_id AND category_id = :category_id
                AND proposed_name = :name AND status = 'pending' LIMIT 1"
        );
        $stmt->execute([':user_id' => $userId, ':category_id' => $categoryId, ':name' => $name]);
        return $stmt->fetchColumn() !== false;
    }

    /** @return int the new request_id */
    public static function insert(int $userId, int $categoryId, string $name, ?string $reason): int
    {
        $db   = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO equipment_type_requests (requested_by, category_id, proposed_name, reason)
             VALUES (:user_id, :category_id, :name, :reason)'
        );
        $stmt->execute([':user_id' => $userId, ':category_id' => $categoryId, ':name' => $name, ':reason' => $reason]);
        return (int) $db->lastInsertId();
    }

    /** @return array<string,mixed>|null */
    public static function find(int $requestId): ?array
    {
        $stmt = getDbConnection()->prepare(self::SELECT . ' WHERE r.request_id = :id');
        $stmt->execute([':id' => $requestId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return array<int,array<string,mixed>> */
    public static function page(string $status, int $limit, int $offset): array
    {
        [$where, $bind] = self::conditions($status);
        $stmt = getDbConnection()->prepare(
            self::SELECT . $where . '
              ORDER BY r.status = \'pending\' DESC, r.created_at DESC, r.request_id DESC
              LIMIT ' . $limit . ' OFFSET ' . $offset
        );
        $stmt->execute($bind);
        return $stmt->fetchAll();
    }

    public static function count(string $status): int
    {
        [$where, $bind] = self::conditions($status);
        $stmt = getDbConnection()->prepare('SELECT COUNT(*) FROM equipment_type_requests r' . $where);
        $stmt->execute($bind);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Decides a pending request. Returns false when it was no longer pending
     * (another admin got there first), so nothing is changed twice.
     */
    public static function decide(int $requestId, string $status, int $adminId, ?string $note, ?int $typeId): bool
    {
        $stmt = getDbConnection()->prepare(
            "UPDATE equipment_type_requests
                SET status = :status, reviewed_by = :admin_id, admin_note = :note,
                    resolved_type_id = :type_id, reviewed_at = CURRENT_TIMESTAMP
              WHERE request_id = :id AND status = 'pending'"
        );
        $stmt->execute([
            ':status'   => $status,
            ':admin_id' => $adminId,
            ':note'     => $note,
            ':type_id'  => $typeId,
            ':id'       => $requestId,
        ]);
        return $stmt->rowCount() === 1;
    }

    /** @return array{0:string,1:array<string,mixed>} */
    private static function conditions(string $status): array
    {
        if ($status === '') {
            return ['', []];
        }
        return [' WHERE r.status = :status', [':status' => $status]];
    }
}
