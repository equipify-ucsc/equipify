<?php
/**
 * The signed-in user's notification feed.
 *
 * Rows come from backend/fixtures/notifications.json, keyed by role, until the
 * notifications table exists. The response shapes are the ones the real
 * endpoint will use, so the pages do not change when it does — only the two
 * lines here that read the fixture.
 *
 * "Read" is the one piece of state that has to survive a reload, so it is kept
 * per session (see core/FixtureState.php) rather than thrown away.
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/Fixtures.php';
require_once __DIR__ . '/../core/FixtureState.php';

final class NotificationController
{
    /** Marks laid over the fixture's own is_read flag. */
    private const READ_BUCKET = 'notifications.read';

    /** GET /notifications?type=&unread=1&page=&per_page= */
    public static function index(array $params = []): void
    {
        $rows = self::rows();

        // The filter offers whatever types this role's rows actually use, so a
        // stale option can never silently return nothing.
        $type   = ListQuery::enum('type', array_values(array_unique(array_column($rows, 'type'))));
        $unread = ListQuery::flag('unread');

        $page     = ListQuery::page();
        $perPage  = ListQuery::perPage(10);
        $envelope = ListQuery::paginate(
            $rows,
            $page,
            $perPage,
            static function (array $row) use ($type, $unread): bool {
                if ($type !== '' && $row['type'] !== $type) {
                    return false;
                }
                return !($unread && $row['is_read']);
            }
        );

        // The feed's pager expects at least one page even when empty; the
        // shared envelope reports 0, which reads as "no pages at all".
        $envelope['total_pages'] = max(1, (int) $envelope['total_pages']);

        Response::ok($envelope);
    }

    /**
     * PUT /notifications/read
     * Body is {"notification_id": "dn-3"} for one, or {"all": true} for the lot.
     */
    public static function markRead(array $params = []): void
    {
        $in     = Router::jsonBody();
        $rows   = self::rows();
        $all    = !empty($in['all']);
        $target = is_string($in['notification_id'] ?? null) ? $in['notification_id'] : '';

        if (!$all && $target === '') {
            Response::error('Tell us which notification to mark read.', 422, [
                'notification_id' => 'A notification id is required.',
            ]);
        }
        if (!$all && !in_array($target, array_column($rows, 'notification_id'), true)) {
            Response::error('Notification not found.', 404);
        }

        $marked = 0;
        foreach ($rows as $row) {
            if ($row['is_read'] || (!$all && $row['notification_id'] !== $target)) {
                continue;
            }
            FixtureState::put(self::READ_BUCKET, (string) $row['notification_id'], true);
            $marked++;
        }

        Response::ok(['marked' => $marked]);
    }

    /** GET /notifications/counts — the sidenav badges. */
    public static function counts(array $params = []): void
    {
        $unread = 0;
        foreach (self::rows() as $row) {
            if (!$row['is_read']) {
                $unread++;
            }
        }

        require_once __DIR__ . '/MessageController.php';
        Response::ok([
            'notifications' => $unread,
            'messages'      => MessageController::unreadTotal(),
        ]);
    }

    /**
     * This role's notifications, newest first, with the session's read marks
     * applied and the stored minute offsets turned into timestamps.
     *
     * @return array<int,array<string,mixed>>
     */
    private static function rows(): array
    {
        $read = FixtureState::bucket(self::READ_BUCKET);

        $rows = array_map(static function (array $row) use ($read): array {
            return [
                'notification_id' => $row['notification_id'],
                'type'            => $row['type'],
                'title'           => $row['title'],
                'body'            => $row['body'],
                'link'            => $row['link'],
                'is_read'         => !empty($row['is_read']) || isset($read[$row['notification_id']]),
                'created_at'      => Fixtures::at((int) $row['minutes_ago']),
            ];
        }, Fixtures::forRole('notifications', Auth::role()));

        usort($rows, static fn (array $a, array $b): int => strcmp($b['created_at'], $a['created_at']));
        return $rows;
    }
}
