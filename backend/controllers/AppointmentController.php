<?php
/**
 * The technician's maintenance appointments.
 *
 * Rows come from backend/fixtures/appointments.json until the appointments
 * table exists. Filtering and paging happen here rather than in the page, so a
 * status filter narrows the whole list instead of only the rows on screen.
 *
 * A status the technician sets is kept per session, so the change survives a
 * reload instead of being repainted away.
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/Fixtures.php';
require_once __DIR__ . '/../core/FixtureState.php';

final class AppointmentController
{
    /** The statuses an appointment moves through. */
    public const STATUSES = ['active', 'in_progress', 'on_hold', 'completed'];

    private const BUCKET = 'appointments.status';

    /**
     * Sort key => [field, direction]. The key carries its own direction, the
     * way EquipmentModel::PUBLIC_SORTS does, so the page needs one control
     * rather than a field and a separate asc/desc.
     */
    public const SORTS = [
        'scheduled_asc'  => ['scheduled_on', 1],
        'scheduled_desc' => ['scheduled_on', -1],
        'customer'       => ['customer', 1],
        'reference'      => ['reference', 1],
    ];

    /** Used when no sort is asked for, or an unknown one is. */
    private const DEFAULT_SORT = 'scheduled_asc';

    /** GET /appointments?status=&q=&sort=&page=&per_page= */
    public static function index(array $params = []): void
    {
        $status = ListQuery::enum('status', self::STATUSES);
        $q      = ListQuery::search();
        // An unknown sort reads as no sort, so a stale link falls back to the
        // default rather than failing.
        $sort   = ListQuery::enum('sort', array_keys(self::SORTS)) ?: self::DEFAULT_SORT;

        // Sorting has to happen before paginate(), which slices whatever order
        // it is handed.
        Response::ok(ListQuery::paginate(
            self::sortRows(self::rows(), $sort),
            ListQuery::page(),
            ListQuery::perPage(8),
            static function (array $row) use ($status, $q): bool {
                if ($status !== '' && $row['status'] !== $status) {
                    return false;
                }
                return ListQuery::contains(
                    $q,
                    (string) $row['reference'],
                    (string) $row['equipment'],
                    (string) $row['service_type'],
                    (string) $row['site'],
                    (string) $row['customer']
                );
            }
        ));
    }

    /** PUT /appointments/{id}/status — body {"status": "in_progress"} */
    public static function updateStatus(array $params = []): void
    {
        $id = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        if ($id === false || $id < 1 || self::find($id) === null) {
            Response::error('Appointment not found.', 404);
        }

        $in     = Router::jsonBody();
        $status = is_string($in['status'] ?? null) ? $in['status'] : '';
        if ($message = Validator::oneOf($status, self::STATUSES, 'status')) {
            Response::error('Please fix the highlighted fields.', 422, ['status' => $message]);
        }

        FixtureState::put(self::BUCKET, (string) $id, $status);
        Response::ok(self::find($id));
    }

    /**
     * Every appointment booked with this technician, in no particular order,
     * with any status set during this session applied. sortRows() orders them.
     *
     * @return array<int,array<string,mixed>>
     */
    private static function rows(): array
    {
        $changed = FixtureState::bucket(self::BUCKET);

        $rows = array_map(static function (array $row) use ($changed): array {
            $id = (int) $row['appointment_id'];
            return [
                'appointment_id' => $id,
                'reference'      => $row['reference'],
                'equipment'      => $row['equipment'],
                'icon'           => $row['icon'],
                'service_type'   => $row['service_type'],
                'site'           => $row['site'],
                'customer'       => $row['customer'],
                'scheduled_on'   => Fixtures::day((int) $row['days_from_now']),
                'status'         => $changed[(string) $id] ?? $row['status'],
            ];
        }, Fixtures::load('appointments')['rows'] ?? []);

        return $rows;
    }

    /**
     * Orders rows by one of self::SORTS, tie-breaking on the id so a row can
     * never drift between pages when two share a date or a customer.
     *
     * @param array<int,array<string,mixed>> $rows
     * @return array<int,array<string,mixed>>
     */
    private static function sortRows(array $rows, string $sort): array
    {
        [$field, $direction] = self::SORTS[$sort] ?? self::SORTS[self::DEFAULT_SORT];

        usort($rows, static function (array $a, array $b) use ($field, $direction): int {
            $order = strcmp((string) $a[$field], (string) $b[$field]) * $direction;
            return $order !== 0 ? $order : $a['appointment_id'] <=> $b['appointment_id'];
        });

        return $rows;
    }

    /** @return array<string,mixed>|null */
    private static function find(int $id): ?array
    {
        foreach (self::rows() as $row) {
            if ($row['appointment_id'] === $id) {
                return $row;
            }
        }
        return null;
    }
}
