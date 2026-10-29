<?php
/** Creates database-backed notifications for application workflows. */

declare(strict_types=1);

require_once __DIR__ . '/../models/NotificationModel.php';

final class NotificationService
{
    /**
     * @return array<string,mixed> The persisted notification row.
     * @throws InvalidArgumentException when the recipient or content is invalid.
     * @throws RuntimeException when the database cannot save the notification.
     */
    public static function notify(
        int $userId,
        string $type,
        string $title,
        string $body,
        ?string $link = null
    ): array {
        $type = trim($type);
        $title = trim($title);
        $body = trim($body);
        $link = $link === null ? null : trim($link);

        if ($userId < 1) {
            throw new InvalidArgumentException('A valid recipient user ID is required.');
        }
        if ($type === '' || self::length($type) > 80) {
            throw new InvalidArgumentException('A valid notification type is required.');
        }
        if ($title === '' || self::length($title) > 150) {
            throw new InvalidArgumentException('A valid notification title is required.');
        }
        if ($body === '' || strlen($body) > 65535) {
            throw new InvalidArgumentException('A valid notification body is required.');
        }
        if ($link === '') {
            $link = null;
        }
        if ($link !== null && self::length($link) > 500) {
            throw new InvalidArgumentException('The notification link is too long.');
        }

        try {
            if (!NotificationModel::userExists($userId)) {
                throw new InvalidArgumentException('The notification recipient does not exist.');
            }

            return NotificationModel::insert([
                'user_id' => $userId,
                'type'    => $type,
                'title'   => $title,
                'body'    => $body,
                'link'    => $link,
            ]);
        } catch (InvalidArgumentException $e) {
            throw $e;
        } catch (Throwable $e) {
            error_log('Notification persistence failed: ' . $e->getMessage());
            throw new RuntimeException('Notification could not be saved.');
        }
    }

    private static function length(string $value): int
    {
        return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    }
}
