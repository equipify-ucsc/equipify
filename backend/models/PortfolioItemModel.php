<?php
/**
 * SQL for the `portfolio_items` table (work samples on a professional's profile).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class PortfolioItemModel
{
    /**
     * @param array{title:string,equipment:string,description:?string,image_url:?string,completed_on:?string} $item
     * @return int the new portfolio_item_id
     */
    public static function insert(int $userId, array $item): int
    {
        $db = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO portfolio_items
                 (user_id, title, equipment, description, image_url, completed_on)
             VALUES (:user_id, :title, :equipment, :description, :image_url, :completed_on)'
        );
        $stmt->execute([
            ':user_id'      => $userId,
            ':title'        => $item['title'],
            ':equipment'    => $item['equipment'],
            ':description'  => $item['description'],
            ':image_url'    => $item['image_url'],
            ':completed_on' => $item['completed_on'],
        ]);
        return (int) $db->lastInsertId();
    }

    /**
     * One page of a user's own samples, most recent work first.
     *
     * @param array{q?:string} $filters
     * @return array<int,array<string,mixed>>
     */
    public static function pageForUser(int $userId, array $filters, int $limit, int $offset): array
    {
        [$where, $bind] = self::conditions($userId, $filters);

        $stmt = getDbConnection()->prepare(
            'SELECT portfolio_item_id, title, equipment, description,
                    image_url, completed_on, created_at
               FROM portfolio_items
              ' . $where . '
              ORDER BY COALESCE(completed_on, DATE(created_at)) DESC, portfolio_item_id DESC
              LIMIT ' . $limit . ' OFFSET ' . $offset
        );
        $stmt->execute($bind);
        return $stmt->fetchAll();
    }

    /**
     * How many rows the same filters match, for the pager.
     *
     * @param array{q?:string} $filters
     */
    public static function countForUser(int $userId, array $filters): int
    {
        [$where, $bind] = self::conditions($userId, $filters);
        $stmt = getDbConnection()->prepare('SELECT COUNT(*) FROM portfolio_items ' . $where);
        $stmt->execute($bind);
        return (int) $stmt->fetchColumn();
    }

    /**
     * One sample, but only if it belongs to this user. The ownership check is
     * part of the query so a guessed id can never read someone else's row.
     *
     * @return array<string,mixed>|null
     */
    public static function findForUser(int $itemId, int $userId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT portfolio_item_id, title, equipment, description,
                    image_url, completed_on, created_at
               FROM portfolio_items
              WHERE portfolio_item_id = :id AND user_id = :user_id'
        );
        $stmt->execute([':id' => $itemId, ':user_id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Shared WHERE clause so the page query and its count can never drift.
     * LIMIT/OFFSET are inlined as integers above because MySQL will not bind
     * them as placeholders in emulated-prepare-off mode; every value that comes
     * from the request is bound.
     *
     * @param array{q?:string} $filters
     * @return array{0:string,1:array<string,mixed>}
     */
    private static function conditions(int $userId, array $filters): array
    {
        $where = ['user_id = :user_id'];
        $bind  = [':user_id' => $userId];

        if (($filters['q'] ?? '') !== '') {
            // Two placeholders for one term: with emulated prepares off, MySQL
            // will not let the same named placeholder appear twice.
            $where[] = '(title LIKE :q_title OR equipment LIKE :q_equipment)';
            // The wildcards are added here, and LIKE's own metacharacters in the
            // search term are escaped, so a '%' typed by the user stays literal.
            $term = '%' . addcslashes($filters['q'], '%_\\') . '%';
            $bind[':q_title']     = $term;
            $bind[':q_equipment'] = $term;
        }

        return ['WHERE ' . implode(' AND ', $where), $bind];
    }
}
