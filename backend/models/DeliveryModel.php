<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/db_config.php';

final class DeliveryModel
{
    /** Reserved integration boundary. Never trusts caller-supplied payment/address data. */
    public static function createFromRental(int $rentalId): array
    {
        if ($rentalId < 1) return ['status' => 'invalid', 'created' => []];
        // No rentals/payment schema exists in this checkout. Fail closed rather
        // than inventing paid states, assigning a manager or persisting unverified data.
        throw new LogicException('Rental payment and logistics persistence is not available; delivery creation is blocked.');
    }

    public static function listing(int $areaId, int $page, int $perPage, string $status = ''): array
    {
        $perPage = max(1, min(50, $perPage));
        $where = 'area_id = ?' . ($status === '' ? '' : ' AND status = ?');
        $args = $status === '' ? [$areaId] : [$areaId, $status];
        $db = getDbConnection();
        $stmt = $db->prepare('SELECT COUNT(*) FROM deliveries WHERE ' . $where);
        $stmt->execute($args);
        $total = (int) $stmt->fetchColumn();
        $page = max(1, min($page, max(1, (int) ceil($total / $perPage))));
        $stmt = $db->prepare('SELECT delivery_id, related_reference, pickup_address, delivery_address,
            scheduled_at, status, created_at FROM deliveries WHERE ' . $where .
            ' ORDER BY created_at DESC, delivery_id DESC LIMIT ' . $perPage . ' OFFSET ' . (($page - 1) * $perPage));
        $stmt->execute($args);
        return ['items' => $stmt->fetchAll(), 'page' => $page, 'per_page' => $perPage,
            'total' => $total, 'total_pages' => (int) ceil($total / $perPage)];
    }
}
