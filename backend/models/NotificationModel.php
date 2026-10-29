<?php
/** SQL access for persisted user notifications. */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class NotificationModel
{
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
