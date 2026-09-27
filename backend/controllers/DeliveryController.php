<?php
/**
 * The delivery person's assigned deliveries.
 *
 * Rows come from backend/fixtures/deliveries.json until the deliveries table
 * exists. Filtering and paging happen here rather than in the page, so a
 * status filter narrows the whole list instead of only the rows on screen —
 * which is what the old client-side tab filtering got wrong.
 *
 * A status the driver sets is kept per session, so the change survives a
 * reload instead of being repainted away.
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/Fixtures.php';
require_once __DIR__ . '/../core/FixtureState.php';

final class DeliveryController
{
    /** The statuses a delivery moves through, in order. */
    public const STATUSES = ['pending_pickup', 'in_transit', 'delayed', 'delivered'];

    private const BUCKET = 'deliveries.status';

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

    /** GET /deliveries?status=&q=&sort=&page=&per_page= */
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
                    (string) $row['destination'],
                    (string) $row['customer']
                );
            }
        ));
    }

    /** PUT /deliveries/{id}/status — body {"status": "in_transit"} */
    public static function updateStatus(array $params = []): void
    {
        $id = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        if ($id === false || $id < 1 || self::find($id) === null) {
            Response::error('Delivery not found.', 404);
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
     * GET /profile-extras
     *
     * The bio, years of experience and vehicle type shown on the Profile page.
     * These three sit in a fixture rather than on the profile endpoint because
     * `delivery_personnel` has no columns for them, unlike `maintenance_techs`
     * which carries bio/years_experience/specialization. Serving them here
     * keeps the page free of hardcoded copy without a schema change.
     */
    public static function profileExtras(array $params = []): void
    {
        $extras = Fixtures::load('profile-extras')[Auth::role() ?? ''] ?? [];
        Response::ok([
            'bio'              => $extras['bio'] ?? null,
            'years_experience' => $extras['years_experience'] ?? null,
            'vehicle_type'     => $extras['vehicle_type'] ?? null,
        ]);
    }

    /**
     * Every delivery assigned to this driver, in no particular order, with any
     * status set during this session applied. sortRows() orders them.
     *
     * @return array<int,array<string,mixed>>
     */
    private static function rows(): array
    {
        $changed = FixtureState::bucket(self::BUCKET);

        $rows = array_map(static function (array $row) use ($changed): array {
            $id = (int) $row['delivery_id'];
            return [
                'delivery_id'  => $id,
                'reference'    => $row['reference'],
                'equipment'    => $row['equipment'],
                'icon'         => $row['icon'],
                'destination'  => $row['destination'],
                'customer'     => $row['customer'],
                'vehicle'      => $row['vehicle'],
                'scheduled_on' => Fixtures::day((int) $row['days_from_now']),
                'status'       => $changed[(string) $id] ?? $row['status'],
            ];
        }, Fixtures::load('deliveries')['rows'] ?? []);

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
            return $order !== 0 ? $order : $a['delivery_id'] <=> $b['delivery_id'];
        });

        return $rows;
    }

    /** @return array<string,mixed>|null */
    private static function find(int $id): ?array
    {
        foreach (self::rows() as $row) {
            if ($row['delivery_id'] === $id) {
                return $row;
            }
        }
        return null;
    }
}
