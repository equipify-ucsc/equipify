<?php
/**
 * Public equipment browsing: the Browsing page's search + step-by-step
 * filters, one listing's detail page, and listing photos. No login needed.
 *
 * Only listings customers may see are ever returned (not retired, with an
 * active type in an active category — see EquipmentModel::PUBLIC_WHERE).
 *
 * Filters follow the catalogue's steps: the common ones (price, district,
 * availability, provider rating) always apply; category narrows to a family; type
 * narrows to one kind; and only once a type is chosen are its filterable spec
 * fields (at most 3) accepted, as
 *   spec_<key>=value                      select, yes/no, multiselect ("has")
 *   spec_<key>_min= / spec_<key>_max=     number ranges
 * Anything else — an unknown key, a non-filterable field, a value that isn't
 * one of the options — is ignored rather than an error, like ListQuery::enum.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/EquipmentCategoryModel.php';
require_once __DIR__ . '/../models/EquipmentModel.php';
require_once __DIR__ . '/../models/EquipmentPhotoModel.php';
require_once __DIR__ . '/../models/EquipmentSpecValueModel.php';
require_once __DIR__ . '/../models/SpecFieldModel.php';
require_once __DIR__ . '/../services/EquipmentListingService.php';
require_once __DIR__ . '/CatalogueController.php';
require_once __DIR__ . '/RentingPartyEquipmentController.php';

final class EquipmentBrowseController
{
    private const PHOTO_TYPES = [
        'jpg'  => 'image/jpeg',
        'png'  => 'image/png',
        'webp' => 'image/webp',
    ];

    /** GET /equipment */
    public static function index(array $params = []): void
    {
        $filters = [
            'q'         => ListQuery::search(),
            'category'  => self::id('category'),
            'type'      => self::id('type'),
            'district'  => ListQuery::enum('district', RentingPartyEquipmentController::DISTRICTS),
            'available' => ListQuery::flag('available'),
            'min_price' => self::amount('min_price'),
            'max_price' => self::amount('max_price'),
            'min_rating' => (int) ListQuery::enum('min_rating', ['1', '2', '3', '4', '5']),
            'specs'     => [],
        ];

        // Spec filters only exist once a (visible) type is chosen.
        $specFilters = [];
        if ($filters['type'] > 0 && EquipmentCategoryModel::findType($filters['type'], true) !== null) {
            foreach (SpecFieldModel::forType($filters['type']) as $field) {
                if (!(bool) $field['is_filterable']) {
                    continue;
                }
                $specFilters[] = CatalogueController::presentField($field);
                foreach (self::specConditions($field) as $condition) {
                    $filters['specs'][] = $condition;
                }
            }
        }

        $sort    = ListQuery::enum('sort', array_keys(EquipmentModel::PUBLIC_SORTS));
        $page    = ListQuery::page();
        $perPage = ListQuery::perPage(12);

        $total = EquipmentModel::publicCount($filters);
        $rows  = EquipmentModel::publicPage($filters, $sort === '' ? 'recent' : $sort, $perPage, ($page - 1) * $perPage);

        $data = ListQuery::envelope(array_map(static function (array $row): array {
            return RentingPartyEquipmentController::presentSummary($row) + self::presentOwnerRating($row);
        }, $rows), $page, $perPage, $total);
        $data['spec_filters'] = $specFilters;
        Response::ok($data);
    }

    /** GET /equipment/{id} */
    public static function show(array $params = []): void
    {
        $id  = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $row = ($id === false || $id < 1) ? null : EquipmentModel::findPublic($id);
        if ($row === null) {
            Response::error('This listing is not available.', 404);
        }

        $fields = SpecFieldModel::forType((int) $row['type_id']);
        $photos = array_map(static fn (array $p): array => [
            'photo_id' => (int) $p['photo_id'],
            'is_cover' => (bool) $p['is_cover'],
            'url'      => '/equipment/' . (int) $row['equipment_id'] . '/photos/' . (int) $p['photo_id'],
        ], EquipmentPhotoModel::forEquipment((int) $row['equipment_id']));

        Response::ok(RentingPartyEquipmentController::presentSummary($row) + [
            'year_made'   => $row['year_made'] === null ? null : (int) $row['year_made'],
            'description' => $row['description'],
            'extra_specs' => $row['extra_specs'],
            'specs'       => EquipmentListingService::presentSpecs(
                $fields,
                EquipmentSpecValueModel::forEquipment((int) $row['equipment_id'])
            ),
            'photos'      => $photos,
            'owner'       => [
                'business_name' => $row['business_name'],
                'district'      => $row['owner_district'],
                'verified'      => $row['verification_status'] === 'verified',
                'avg_rating'    => (float) $row['owner_rating'],
                'rating_count'  => (int) $row['owner_rating_count'],
                'member_since'  => substr((string) $row['owner_since'], 0, 4),
            ],
        ]);
    }

    /**
     * GET /equipment/{id}/photos/{photoId}
     *
     * Served to anyone while the listing is public, and always to its owner
     * (so a renting party still sees photos of a hidden listing).
     */
    public static function photo(array $params = []): void
    {
        $equipmentId = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $photoId     = filter_var($params['photoId'] ?? null, FILTER_VALIDATE_INT);
        if ($equipmentId === false || $photoId === false || $equipmentId < 1 || $photoId < 1) {
            Response::error('Photo not found.', 404);
        }

        $isOwner = Auth::role() === 'renting_party'
            && EquipmentModel::findForOwner($equipmentId, (int) Auth::userId()) !== null;
        $photo   = ($isOwner || EquipmentModel::isPublic($equipmentId))
            ? EquipmentPhotoModel::find($photoId, $equipmentId)
            : null;
        if ($photo === null) {
            Response::error('Photo not found.', 404);
        }

        $relative = (string) $photo['file_path'];
        $full     = __DIR__ . '/../storage/' . $relative;
        $ext      = strtolower((string) pathinfo($relative, PATHINFO_EXTENSION));

        // A path that didn't come out of Upload::store(), or a file that has
        // since been removed, is a 404 rather than a leak of the filesystem.
        if (strpos($relative, 'uploads/') !== 0
            || strpos($relative, '..') !== false
            || !isset(self::PHOTO_TYPES[$ext])
            || !is_file($full)
        ) {
            Response::error('Photo not found.', 404);
        }

        header('Content-Type: ' . self::PHOTO_TYPES[$ext]);
        header('Content-Length: ' . (string) filesize($full));
        header('Content-Disposition: inline');
        // A photo never changes under its id (a replacement gets a new id), so
        // browsers may keep it; "private" keeps shared caches out of it.
        header('Cache-Control: private, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        readfile($full);
        exit;
    }

    // ------------------------------------------------------------- helpers

    /**
     * The query-string conditions a filterable field asks for, as
     * [spec_field_id, op, value] (see EquipmentModel::publicConditions).
     *
     * @param array<string,mixed> $field
     * @return array<int,array{0:int,1:string,2:string}>
     */
    private static function specConditions(array $field): array
    {
        $id  = (int) $field['spec_field_id'];
        $key = 'spec_' . $field['field_key'];

        if ($field['data_type'] === 'number') {
            $out = [];
            foreach (['min', 'max'] as $bound) {
                $value = $_GET[$key . '_' . $bound] ?? '';
                if (is_string($value) && preg_match('/^-?\d{1,9}(?:\.\d{1,3})?$/', trim($value)) === 1) {
                    $out[] = [$id, $bound, trim($value)];
                }
            }
            return $out;
        }

        if ($field['data_type'] === 'boolean') {
            $value = ListQuery::enum($key, ['1', '0']);
            return $value === '' ? [] : [[$id, 'eq', $value]];
        }

        $options = json_decode((string) $field['options'], true);
        $value   = ListQuery::enum($key, is_array($options) ? $options : []);
        if ($value === '') {
            return [];
        }
        return [[$id, $field['data_type'] === 'multiselect' ? 'has' : 'eq', $value]];
    }

    /**
     * The provider (renting party) name and rating shown on a card. There is
     * no per-listing review yet, so the rating customers see and filter by is
     * the renting party's.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function presentOwnerRating(array $row): array
    {
        return [
            'business_name'      => $row['business_name'],
            'owner_rating'       => (float) $row['owner_rating'],
            'owner_rating_count' => (int) $row['owner_rating_count'],
        ];
    }

    /** A positive integer id from the query string, or 0. */
    private static function id(string $key): int
    {
        $value = filter_var($_GET[$key] ?? null, FILTER_VALIDATE_INT);
        return ($value === false || $value < 1) ? 0 : $value;
    }

    /** A non-negative LKR amount from the query string, or '' when absent/invalid. */
    private static function amount(string $key): string
    {
        $value = $_GET[$key] ?? '';
        if (!is_string($value) || preg_match('/^\d{1,8}(?:\.\d{1,2})?$/', trim($value)) !== 1) {
            return '';
        }
        return trim($value);
    }
}
