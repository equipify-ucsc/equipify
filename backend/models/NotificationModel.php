<?php
/** SQL access for persisted user notifications. */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class NotificationModel
{
    public static function unreadCount(int $userId): int
    {
        $stmt = getDbConnection()->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
        $stmt->execute([$userId]);
        return (int) $stmt->fetchColumn();
    }

    public static function listing(int $userId, int $page, int $perPage, bool $unread, string $type = ''): array
    {
        $page = max(1, $page);
        $perPage = max(1, min(50, $perPage));
        $where = 'user_id = ?' . ($unread ? ' AND is_read = 0' : '');
        $args = [$userId];
        if ($type !== '') { $where .= ' AND type = ?'; $args[] = $type; }
        $db = getDbConnection();
        $count = $db->prepare('SELECT COUNT(*) FROM notifications WHERE ' . $where);
        $count->execute($args);
        $total = (int) $count->fetchColumn();
        $page = max(1, min($page, max(1, (int) ceil($total / $perPage))));
        $stmt = $db->prepare('SELECT notification_id, type, title, body, link, is_read, created_at, read_at
            FROM notifications WHERE ' . $where . ' ORDER BY created_at DESC, notification_id DESC LIMIT '
            . $perPage . ' OFFSET ' . (($page - 1) * $perPage));
        $stmt->execute($args);
        return ['items' => $stmt->fetchAll(), 'page' => $page, 'per_page' => $perPage,
            'total' => $total, 'total_pages' => (int) ceil($total / $perPage)];
    }

    public static function markRead(int $userId, ?int $id): int
    {
        $stmt = getDbConnection()->prepare('UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND is_read = 0' . ($id === null ? '' : ' AND notification_id = ?'));
        $stmt->execute($id === null ? [$userId] : [$userId, $id]);
        return $stmt->rowCount();
    }

    public static function userExists(int $userId): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM users WHERE user_id = :user_id LIMIT 1'
        );
        $stmt->execute([':user_id' => $userId]);
        return $stmt->fetchColumn() !== false;
    }

    /** @param array{user_id:int,type:string,title:string,body:string,link:?string} $notification
     *  @return array<string,mixed>
     */
    public static function insert(array $notification): array
    {
        $db = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO notifications (user_id, type, title, body, link)
             VALUES (:user_id, :type, :title, :body, :link)'
        );
        $stmt->execute([
            ':user_id' => $notification['user_id'],
            ':type'    => $notification['type'],
            ':title'   => $notification['title'],
            ':body'    => $notification['body'],
            ':link'    => $notification['link'],
        ]);

        $id = (int) $db->lastInsertId();
        $read = $db->prepare(
            'SELECT notification_id, user_id, type, title, body, link,
                    is_read, created_at, read_at
               FROM notifications WHERE notification_id = :id LIMIT 1'
        );
        $read->execute([':id' => $id]);
        $row = $read->fetch();
        if ($row === false) {
            throw new RuntimeException('Created notification could not be read back.');
        }

        $row['notification_id'] = (int) $row['notification_id'];
        $row['user_id'] = (int) $row['user_id'];
        $row['is_read'] = (bool) $row['is_read'];
        return $row;
    }
}
