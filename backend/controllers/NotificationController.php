<?php
declare(strict_types=1);
require_once __DIR__ . '/../models/NotificationModel.php';

final class NotificationController
{
    public static function index(array $params = []): void
    {
        Response::ok(NotificationModel::listing((int) Auth::userId(), ListQuery::page(),
            ListQuery::perPage(), ($_GET['unread'] ?? '') === '1'));
    }

    public static function markRead(array $params = []): void
    {
        $in = Router::jsonBody();
        $id = null;
        if (($in['all'] ?? false) !== true) {
            $id = filter_var($in['notification_id'] ?? null, FILTER_VALIDATE_INT);
            if ($id === false || $id < 1) Response::error('Select a notification or all.', 422);
        }
        Response::ok(['marked' => NotificationModel::markRead((int) Auth::userId(), $id)]);
    }
}
