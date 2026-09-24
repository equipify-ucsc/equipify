<?php
/**
 * SQL for the `equipment` table: renting parties' listings.
 *
 * Two kinds of access:
 *   - owner queries (…ForOwner) always filter on owner_id, so a guessed
 *     equipment_id never reaches another renting party's listing;
 *   - public queries (public…) only ever return listings customers may see:
 *     not retired, with an active type in an active category.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class EquipmentModel
{
    /**
     * Listing columns plus its type/category names, its owner's business name
     * and rating (renting_parties.avg_rating, the provider rating customers
     * filter by), and its cover photo id.
     */
    private const SELECT =
        'SELECT e.equipment_id, e.owner_id, e.type_id, e.title, e.brand, e.model,
                e.year_made, e.serial_no, e.condition_grade, e.district, e.address,
                e.daily_rate_lkr, e.deposit_lkr, e.quantity,
                e.description, e.extra_specs, e.status, e.created_at, e.updated_at,
                t.name AS type_name, t.is_other, t.is_active AS type_active,
                c.category_id, c.name AS category_name, c.icon AS category_icon,
                rp.business_name, rp.avg_rating AS owner_rating,
                rp.rating_count AS owner_rating_count,
                (SELECT p.photo_id FROM equipment_photos p
                  WHERE p.equipment_id = e.equipment_id
                  ORDER BY p.is_cover DESC, p.sort_order, p.photo_id
                  LIMIT 1) AS cover_photo_id
           FROM equipment e
           JOIN equipment_types t      ON t.type_id = e.type_id
           JOIN equipment_categories c ON c.category_id = t.category_id
           JOIN renting_parties rp     ON rp.user_id = e.owner_id';

    /** Owner list sort keys => ORDER BY. */
    public const OWNER_SORTS = [
        'recent' => 'e.created_at DESC, e.equipment_id DESC',
        'name'   => 'e.title ASC, e.equipment_id DESC',
        'price'  => 'e.daily_rate_lkr ASC, e.equipment_id DESC',
    ];

    /** What customers may see. */
    private const PUBLIC_WHERE =
        "e.status <> 'retired' AND t.is_active = 1 AND c.is_active = 1";

    /** Public sort keys => ORDER BY. Anything else falls back to 'recent'. */
    public const PUBLIC_SORTS = [
        'recent'     => 'e.created_at DESC, e.equipment_id DESC',
        'price_asc'  => 'e.daily_rate_lkr ASC, e.equipment_id DESC',
        'price_desc' => 'e.daily_rate_lkr DESC, e.equipment_id DESC',
        'rating'     => 'rp.avg_rating DESC, rp.rating_count DESC, e.equipment_id DESC',
    ];

    // ---------------------------------------------------------------- owner

    /** @return array<string,mixed>|null */
    public static function findForOwner(int $equipmentId, int $ownerId): ?array
    {
        $stmt = getDbConnection()->prepare(
            self::SELECT . ' WHERE e.equipment_id = :id AND e.owner_id = :owner_id'
        );
        $stmt->execute([':id' => $equipmentId, ':owner_id' => $ownerId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * @param array{q?:string,category?:int,status?:string} $filters
     *        status '' = every listing except retired ones
     * @return array<int,array<string,mixed>>
     */
    public static function pageForOwner(int $ownerId, array $filters, string $sort, int $limit, int $offset): array
    {
        [$where, $bind] = self::ownerConditions($ownerId, $filters);
        $stmt = getDbConnection()->prepare(
            self::SELECT . ' WHERE ' . $where . '
              ORDER BY ' . (self::OWNER_SORTS[$sort] ?? self::OWNER_SORTS['recent']) . '
              LIMIT ' . $limit . ' OFFSET ' . $offset
        );
        $stmt->execute($bind);
        return $stmt->fetchAll();
    }

    public static function countForOwner(int $ownerId, array $filters): int
    {
        [$where, $bind] = self::ownerConditions($ownerId, $filters);
        $stmt = getDbConnection()->prepare(
            'SELECT COUNT(*) FROM equipment e
               JOIN equipment_types t      ON t.type_id = e.type_id
               JOIN equipment_categories c ON c.category_id = t.category_id
              WHERE ' . $where
        );
        $stmt->execute($bind);
        return (int) $stmt->fetchColumn();
    }

    /** @return array<string,int> status => count, for the owner's summary tiles */
    public static function statusCountsForOwner(int $ownerId): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT status, COUNT(*) AS n FROM equipment
              WHERE owner_id = :owner_id GROUP BY status'
        );
        $stmt->execute([':owner_id' => $ownerId]);
        $counts = ['available' => 0, 'on_rent' => 0, 'maintenance' => 0, 'retired' => 0];
        foreach ($stmt->fetchAll() as $row) {
            $counts[(string) $row['status']] = (int) $row['n'];
        }
        return $counts;
    }

    /**
     * @param array<string,mixed> $v validated listing fields (see
     *        RentingPartyEquipmentController::readListing)
     * @return int the new equipment_id
     */
    public static function insert(int $ownerId, array $v): int
    {
        $db   = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO equipment
                 (owner_id, type_id, title, brand, model, year_made, serial_no,
                  condition_grade, district, address, daily_rate_lkr, deposit_lkr,
                  quantity, description, extra_specs, status)
             VALUES (:owner_id, :type_id, :title, :brand, :model, :year_made, :serial_no,
                     :condition_grade, :district, :address, :daily_rate_lkr, :deposit_lkr,
                     :quantity, :description, :extra_specs, :status)'
        );
        $stmt->execute(self::bind($v) + [':owner_id' => $ownerId]);
        return (int) $db->lastInsertId();
    }

    /** @param array<string,mixed> $v validated listing fields */
    public static function update(int $equipmentId, int $ownerId, array $v): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE equipment
                SET type_id = :type_id, title = :title, brand = :brand, model = :model,
                    year_made = :year_made, serial_no = :serial_no,
                    condition_grade = :condition_grade, district = :district,
                    address = :address, daily_rate_lkr = :daily_rate_lkr,
                    deposit_lkr = :deposit_lkr, quantity = :quantity,
                    description = :description, extra_specs = :extra_specs,
                    status = :status
              WHERE equipment_id = :id AND owner_id = :owner_id'
        );
        $stmt->execute(self::bind($v) + [':id' => $equipmentId, ':owner_id' => $ownerId]);
    }

    public static function setStatus(int $equipmentId, int $ownerId, string $status): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE equipment SET status = :status
              WHERE equipment_id = :id AND owner_id = :owner_id'
        );
        $stmt->execute([':status' => $status, ':id' => $equipmentId, ':owner_id' => $ownerId]);
    }

    /**
     * Hard-deletes a listing (its spec values and photo rows cascade). A
     * PDOException with MySQL error 1451 escapes when rental history still
     * references it; the caller retires the listing instead.
     */
    public static function delete(int $equipmentId, int $ownerId): void
    {
        $stmt = getDbConnection()->prepare(
            'DELETE FROM equipment WHERE equipment_id = :id AND owner_id = :owner_id'
        );
        $stmt->execute([':id' => $equipmentId, ':owner_id' => $ownerId]);
    }

    // --------------------------------------------------------------- public

    /** A listing customers may see, with its owner's business details. @return array<string,mixed>|null */
    public static function findPublic(int $equipmentId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT x.*, rp.district AS owner_district, rp.verification_status,
                    u.created_at AS owner_since
               FROM (' . self::SELECT . ' WHERE e.equipment_id = :id AND ' . self::PUBLIC_WHERE . ') x
               JOIN renting_parties rp ON rp.user_id = x.owner_id
               JOIN users u            ON u.user_id = x.owner_id'
        );
        $stmt->execute([':id' => $equipmentId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * @param array<string,mixed> $filters see publicConditions()
     * @return array<int,array<string,mixed>> listings with the owner's business name and rating
     */
    public static function publicPage(array $filters, string $sort, int $limit, int $offset): array
    {
        [$where, $bind] = self::publicConditions($filters);
        $order = self::PUBLIC_SORTS[$sort] ?? self::PUBLIC_SORTS['recent'];
        $stmt  = getDbConnection()->prepare(
            self::SELECT . ' WHERE ' . $where . '
              ORDER BY ' . $order . '
              LIMIT ' . $limit . ' OFFSET ' . $offset
        );
        $stmt->execute($bind);
        return $stmt->fetchAll();
    }

    public static function publicCount(array $filters): int
    {
        [$where, $bind] = self::publicConditions($filters);
        $stmt = getDbConnection()->prepare(
            'SELECT COUNT(*) FROM equipment e
               JOIN equipment_types t      ON t.type_id = e.type_id
               JOIN equipment_categories c ON c.category_id = t.category_id
               JOIN renting_parties rp     ON rp.user_id = e.owner_id
              WHERE ' . $where
        );
        $stmt->execute($bind);
        return (int) $stmt->fetchColumn();
    }

    /** Whether customers may currently see this listing. */
    public static function isPublic(int $equipmentId): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM equipment e
               JOIN equipment_types t      ON t.type_id = e.type_id
               JOIN equipment_categories c ON c.category_id = t.category_id
              WHERE e.equipment_id = :id AND ' . self::PUBLIC_WHERE
        );
        $stmt->execute([':id' => $equipmentId]);
        return $stmt->fetchColumn() !== false;
    }

    // -------------------------------------------------------------- helpers

    /** @return array{0:string,1:array<string,mixed>} */
    private static function ownerConditions(int $ownerId, array $filters): array
    {
        $where = ['e.owner_id = :owner_id'];
        $bind  = [':owner_id' => $ownerId];

        $status = (string) ($filters['status'] ?? '');
        if ($status === '') {
            $where[] = "e.status <> 'retired'";
        } else {
            $where[] = 'e.status = :status';
            $bind[':status'] = $status;
        }
        if (!empty($filters['category'])) {
            $where[] = 'c.category_id = :category_id';
            $bind[':category_id'] = (int) $filters['category'];
        }
        if (($filters['q'] ?? '') !== '') {
            self::addSearch($where, $bind, (string) $filters['q'], false);
        }
        return [implode(' AND ', $where), $bind];
    }

    /**
     * Filters (all optional):
     *   q          text in title, brand, model, type or category name
     *   category   category_id           type      type_id
     *   district   exact district        available true = status 'available' only
     *   min_price / max_price  daily rate bounds (LKR)
     *   min_rating provider (renting party) rating of at least this many stars
     *   specs      list of [spec_field_id, op, value], op one of
     *              'eq' (value_text = value), 'has' (multiselect contains value),
     *              'min' / 'max' (value_number bound). The controller builds this
     *              only from the chosen type's filterable fields.
     *
     * @return array{0:string,1:array<string,mixed>}
     */
    private static function publicConditions(array $filters): array
    {
        $where = [self::PUBLIC_WHERE];
        $bind  = [];

        if (!empty($filters['category'])) {
            $where[] = 'c.category_id = :category_id';
            $bind[':category_id'] = (int) $filters['category'];
        }
        if (!empty($filters['type'])) {
            $where[] = 'e.type_id = :type_id';
            $bind[':type_id'] = (int) $filters['type'];
        }
        if (($filters['district'] ?? '') !== '') {
            $where[] = 'e.district = :district';
            $bind[':district'] = (string) $filters['district'];
        }
        if (!empty($filters['available'])) {
            $where[] = "e.status = 'available'";
        }
        if (($filters['min_price'] ?? '') !== '') {
            $where[] = 'e.daily_rate_lkr >= :min_price';
            $bind[':min_price'] = (string) $filters['min_price'];
        }
        if (($filters['max_price'] ?? '') !== '') {
            $where[] = 'e.daily_rate_lkr <= :max_price';
            $bind[':max_price'] = (string) $filters['max_price'];
        }
        if (!empty($filters['min_rating'])) {
            // A provider with no ratings yet has avg_rating 0, so any star
            // filter leaves them out rather than treating them as top-rated.
            $where[] = 'rp.rating_count > 0 AND rp.avg_rating >= :min_rating';
            $bind[':min_rating'] = (int) $filters['min_rating'];
        }
        if (($filters['q'] ?? '') !== '') {
            self::addSearch($where, $bind, (string) $filters['q'], true);
        }

        // One EXISTS per spec filter; placeholders are numbered because a
        // named placeholder can't appear twice with emulated prepares off.
        foreach ($filters['specs'] ?? [] as $i => [$fieldId, $op, $value]) {
            $f = ':sf' . $i;
            $v = ':sv' . $i;
            switch ($op) {
                case 'min':
                    $test = 'sv.value_number >= ' . $v;
                    break;
                case 'max':
                    $test = 'sv.value_number <= ' . $v;
                    break;
                case 'has':
                    // multiselect values are stored as a JSON array of strings
                    $test = 'sv.value_text LIKE ' . $v;
                    $value = '%' . addcslashes(json_encode((string) $value, JSON_UNESCAPED_UNICODE), '%_\\') . '%';
                    break;
                default:
                    $test = 'sv.value_text = ' . $v;
            }
            $where[] = 'EXISTS (SELECT 1 FROM equipment_spec_values sv
                                 WHERE sv.equipment_id = e.equipment_id
                                   AND sv.spec_field_id = ' . $f . ' AND ' . $test . ')';
            $bind[$f] = (int) $fieldId;
            $bind[$v] = (string) $value;
        }

        return [implode(' AND ', $where), $bind];
    }

    /** Adds "any of these columns contains $term", one placeholder per column. */
    private static function addSearch(array &$where, array &$bind, string $term, bool $withCategory): void
    {
        $like    = '%' . addcslashes($term, '%_\\') . '%';
        $columns = ['e.title', 'e.brand', 'e.model', 't.name'];
        if ($withCategory) {
            $columns[] = 'c.name';
        }
        $parts = [];
        foreach ($columns as $i => $column) {
            $parts[] = $column . ' LIKE :q' . $i;
            $bind[':q' . $i] = $like;
        }
        $where[] = '(' . implode(' OR ', $parts) . ')';
    }

    /** @return array<string,mixed> */
    private static function bind(array $v): array
    {
        return [
            ':type_id'            => $v['type_id'],
            ':title'              => $v['title'],
            ':brand'              => $v['brand'],
            ':model'              => $v['model'],
            ':year_made'          => $v['year_made'],
            ':serial_no'          => $v['serial_no'],
            ':condition_grade'    => $v['condition_grade'],
            ':district'           => $v['district'],
            ':address'            => $v['address'],
            ':daily_rate_lkr'     => $v['daily_rate_lkr'],
            ':deposit_lkr'        => $v['deposit_lkr'],
            ':quantity'           => $v['quantity'],
            ':description'        => $v['description'],
            ':extra_specs'        => $v['extra_specs'],
            ':status'             => $v['status'],
        ];
    }
}
