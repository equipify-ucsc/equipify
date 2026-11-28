<?php
declare(strict_types=1);
require_once __DIR__ . '/../models/NotificationModel.php';

final class NotificationController
{
    public static function index(array $params = []): void
    {
        Auth::requireActiveAccount();
        Response::ok(NotificationModel::listing((int) Auth::userId(), ListQuery::page(),
            ListQuery::perPage(), ListQuery::flag('unread'), ListQuery::enum('type', ['job', 'bid', 'payment', 'complaint', 'delivery'])));
    }

    public static function markRead(array $params = []): void
    {
        Auth::requireActiveAccount();
        $in = Router::jsonBody();
        $id = null;
        if (($in['all'] ?? false) !== true) {
            $id = filter_var($in['notification_id'] ?? null, FILTER_VALIDATE_INT);
            if ($id === false || $id < 1) Response::error('Select a notification or all.', 422);
        }
        Response::ok(['marked' => NotificationModel::markRead((int) Auth::userId(), $id)]);
    }

    public static function unreadCount(array $params = []): void
    {
        Auth::requireActiveAccount();
        Response::ok(['count' => NotificationModel::unreadCount((int) Auth::userId())]);
    }
}
