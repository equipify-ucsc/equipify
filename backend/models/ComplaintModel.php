<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

/** Uses the existing complaints table; identities always come from the session. */
final class ComplaintModel
{
    public const TARGET_ROLES = [
        'customer' => ['renting_party', 'freelance_worker', 'delivery_personnel'],
        'renting_party' => ['customer', 'freelance_worker', 'delivery_personnel', 'maintenance_tech'],
        'freelance_worker' => ['customer'],
        'maintenance_tech' => ['renting_party'],
        'delivery_personnel' => ['customer'],
    ];
    public const REVIEWERS = ['admin', 'area_manager'];
    public const STATUSES = ['open', 'under_review', 'resolved'];
    public const CATEGORIES = ['Payment / Billing', 'Equipment Issue', 'Delivery Issue', 'Service Issue',
        'Behaviour / Misconduct', 'Account Issue', 'Damage / Loss', 'Other'];

    private const FROM = ' FROM complaints c JOIN users u ON u.user_id = c.complainant_id
        LEFT JOIN users t ON t.user_id = c.against_user_id';
    private const SELECT = 'SELECT c.*, u.full_name AS complainant_name, t.full_name AS against_name';

    public static function canTarget(int $userId, string $role, int $targetId, string $targetRole): bool
    {
        return $userId !== $targetId && in_array($targetRole, self::TARGET_ROLES[$role] ?? [], true);
    }

    public static function canView(array $row, int $userId, string $role): bool
    {
        return in_array($role, self::REVIEWERS, true) || (int) $row['complainant_id'] === $userId;
    }

    public static function targets(int $userId, string $role): array
    {
        $roles = self::TARGET_ROLES[$role] ?? [];
        if (!$roles) return [];
        $placeholders = implode(',', array_fill(0, count($roles), '?'));
        $stmt = getDbConnection()->prepare("SELECT user_id, full_name, role FROM users
            WHERE user_id <> ? AND role IN ($placeholders) AND account_status = 'active' ORDER BY full_name, user_id");
        $stmt->execute(array_merge([$userId], $roles));
        return $stmt->fetchAll();
    }

    public static function target(int $id): ?array
    {
        $stmt = getDbConnection()->prepare('SELECT user_id, role, account_status FROM users WHERE user_id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function insert(int $userId, string $role, int $targetId, array $input, ?string $attachment): int
    {
        // Recheck the target in SQL at insertion, including its current role/status.
        $roles = self::TARGET_ROLES[$role] ?? [];
        if (!$roles || $userId === $targetId) throw new DomainException('This complaint target is not allowed.');
        $placeholders = implode(',', array_fill(0, count($roles), '?'));
        $db = getDbConnection();
        $stmt = $db->prepare("INSERT INTO complaints
            (complainant_id, complainant_role, against_user_id, against_role, category, subject, description, attachment_url)
            SELECT ?, ?, user_id, role, ?, ?, ?, ? FROM users
            WHERE user_id = ? AND user_id <> ? AND role IN ($placeholders) AND account_status = 'active'");
        $stmt->execute(array_merge([$userId, $role, $input['category'], $input['subject'],
            $input['description'], $attachment, $targetId, $userId], $roles));
        if ($stmt->rowCount() !== 1) throw new DomainException('This complaint target is no longer available.');
        return (int) $db->lastInsertId();
    }

    public static function find(int $id): ?array
    {
        $stmt = getDbConnection()->prepare(self::SELECT . self::FROM . ' WHERE c.complaint_id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function listing(?int $ownerId, string $search, string $status, string $category,
        string $sort, string $direction, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $bind = [];
        if ($ownerId !== null) { $where[] = 'c.complainant_id = ?'; $bind[] = $ownerId; }
        if ($status !== '') { $where[] = 'c.status = ?'; $bind[] = $status; }
        if ($category !== '') { $where[] = 'c.category = ?'; $bind[] = $category; }
        if ($search !== '') {
            $where[] = '(c.subject LIKE ? OR u.full_name LIKE ? OR t.full_name LIKE ? OR CAST(c.complaint_id AS CHAR) LIKE ?)';
            $bind = array_merge($bind, array_fill(0, 4, '%' . $search . '%'));
        }
        $sql = self::FROM . ' WHERE ' . implode(' AND ', $where);
        $stmt = getDbConnection()->prepare('SELECT COUNT(*)' . $sql);
        $stmt->execute($bind);
        $total = (int) $stmt->fetchColumn();
        $page = min($page, max(1, (int) ceil($total / $perPage)));
        $columns = ['complaint_id' => 'c.complaint_id', 'complainant_name' => 'u.full_name',
            'complainant_role' => 'c.complainant_role', 'against_name' => 't.full_name',
            'against_role' => 'c.against_role', 'category' => 'c.category', 'subject' => 'c.subject',
            'created_at' => 'c.created_at', 'status' => 'c.status'];
        $order = $columns[$sort] ?? 'c.created_at';
        $dir = $direction === 'asc' ? 'ASC' : 'DESC';
        $stmt = getDbConnection()->prepare(self::SELECT . $sql . " ORDER BY $order $dir, c.complaint_id $dir LIMIT "
            . $perPage . ' OFFSET ' . (($page - 1) * $perPage));
        $stmt->execute($bind);
        return ['items' => $stmt->fetchAll(), 'page' => $page, 'per_page' => $perPage,
            'total' => $total, 'total_pages' => (int) ceil($total / $perPage)];
    }

    public static function updateStatus(int $id, string $status): void
    {
        $stmt = getDbConnection()->prepare('UPDATE complaints SET status = ? WHERE complaint_id = ?');
        $stmt->execute([$status, $id]);
    }
}
