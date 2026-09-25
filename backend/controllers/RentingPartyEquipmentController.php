<?php
/**
 * A renting party's own equipment listings: list, add, edit, change status,
 * remove, and manage photos.
 *
 * Every listing picks one equipment type from the catalogue, and the type
 * decides which spec fields it asks for (see EquipmentListingService). The
 * price is a daily rate in LKR only. "Other ..." types have no spec fields;
 * those listings describe themselves in extra_specs instead.
 *
 * Removing a listing hard-deletes it unless rental history points at it, in
 * which case it is retired (hidden everywhere but kept). Each renting party
 * only ever sees or touches its own listings.
 *
 * Photos are uploaded one per request (base64 inside JSON, see
 * core/Upload.php) after the listing exists, so no single request carries
 * several megabytes of images.
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/Upload.php';
require_once __DIR__ . '/../models/EquipmentCategoryModel.php';
require_once __DIR__ . '/../models/EquipmentModel.php';
require_once __DIR__ . '/../models/EquipmentPhotoModel.php';
require_once __DIR__ . '/../models/EquipmentSpecValueModel.php';
require_once __DIR__ . '/../models/SpecFieldModel.php';
require_once __DIR__ . '/../services/EquipmentListingService.php';

final class RentingPartyEquipmentController
{
    public const DISTRICTS = [
        'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
        'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
        'Mannar', 'Matale', 'Matara', 'Moneragala', 'Mullaitivu', 'Nuwara Eliya',
        'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
    ];

    public const CONDITIONS = [
        'excellent' => 'Excellent',
        'good'      => 'Good',
        'fair'      => 'Fair',
    ];

    public const STATUSES = [
        'available'   => 'Available',
        'on_rent'     => 'On Rent',
        'maintenance' => 'Maintenance',
        'retired'     => 'Retired',
    ];

    /** The statuses a renting party picks by hand; retired comes from removing. */
    private const EDITABLE_STATUSES = ['available', 'on_rent', 'maintenance'];

    private const MAX_PHOTOS      = 8;
    private const MAX_PHOTO_BYTES = 3145728; // 3 MB, same ceiling as portfolio photos

    /** MySQL "Cannot delete or update a parent row: a foreign key constraint fails". */
    private const MYSQL_ROW_IS_REFERENCED = 1451;

    /** GET /renting-party/equipment?q=&category=&status=&sort=&page=&per_page= */
    public static function index(array $params = []): void
    {
        $ownerId  = (int) Auth::userId();
        $category = filter_var($_GET['category'] ?? null, FILTER_VALIDATE_INT);
        $filters  = [
            'q'        => ListQuery::search(),
            'category' => $category === false ? 0 : $category,
            'status'   => ListQuery::enum('status', array_keys(self::STATUSES)),
        ];
        $page    = ListQuery::page();
        $perPage = ListQuery::perPage(9);

        $total = EquipmentModel::countForOwner($ownerId, $filters);
        $sort  = ListQuery::enum('sort', array_keys(EquipmentModel::OWNER_SORTS));
        $rows  = EquipmentModel::pageForOwner($ownerId, $filters, $sort, $perPage, ($page - 1) * $perPage);

        $data = ListQuery::envelope(array_map([self::class, 'presentSummary'], $rows), $page, $perPage, $total);
        $data['status_counts'] = EquipmentModel::statusCountsForOwner($ownerId);
        Response::ok($data);
    }

    /** GET /renting-party/equipment/{id} */
    public static function show(array $params = []): void
    {
        Response::ok(self::presentDetail(self::findOr404($params)));
    }

    /** POST /renting-party/equipment */
    public static function store(array $params = []): void
    {
        $ownerId = (int) Auth::userId();
        [$listing, $specRows] = self::readListing(Router::jsonBody(), null);

        $equipmentId = EquipmentListingService::create($ownerId, $listing, $specRows);
        Response::ok(self::presentDetail((array) EquipmentModel::findForOwner($equipmentId, $ownerId)), 201);
    }

    /** PUT /renting-party/equipment/{id} */
    public static function update(array $params = []): void
    {
        $ownerId = (int) Auth::userId();
        $current = self::findOr404($params);
        if ($current['status'] === 'retired') {
            Response::error('This listing has been removed and can no longer be edited.', 409);
        }

        [$listing, $specRows] = self::readListing(Router::jsonBody(), $current);
        EquipmentListingService::update((int) $current['equipment_id'], $ownerId, $listing, $specRows);
        Response::ok(self::presentDetail((array) EquipmentModel::findForOwner((int) $current['equipment_id'], $ownerId)));
    }

    /** POST /renting-party/equipment/{id}/status — body: {status} */
    public static function updateStatus(array $params = []): void
    {
        $ownerId = (int) Auth::userId();
        $current = self::findOr404($params);
        if ($current['status'] === 'retired') {
            Response::error('This listing has been removed and can no longer be changed.', 409);
        }
        $status = self::str(Router::jsonBody(), 'status');
        if ($m = Validator::oneOf($status, self::EDITABLE_STATUSES, 'status')) {
            Response::error('Please fix the highlighted fields.', 422, ['status' => $m]);
        }
        EquipmentModel::setStatus((int) $current['equipment_id'], $ownerId, $status);
        Response::ok(self::presentSummary((array) EquipmentModel::findForOwner((int) $current['equipment_id'], $ownerId)));
    }

    /**
     * DELETE /renting-party/equipment/{id}
     *
     * Tries a hard delete first (spec values and photo rows cascade, and the
     * photo files are removed from disk). When rental history references the
     * listing, the FK refuses and the listing is retired instead.
     */
    public static function destroy(array $params = []): void
    {
        $ownerId     = (int) Auth::userId();
        $current     = self::findOr404($params);
        $equipmentId = (int) $current['equipment_id'];

        if ($current['status'] === 'retired') {
            Response::error('This listing has already been removed.', 409);
        }
        if ($current['status'] === 'on_rent') {
            Response::error('This equipment is on rent. Mark it as returned before removing it.', 409);
        }

        $paths = EquipmentPhotoModel::pathsFor($equipmentId);
        try {
            EquipmentModel::delete($equipmentId, $ownerId);
            $outcome = 'deleted';
        } catch (PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== self::MYSQL_ROW_IS_REFERENCED) {
                throw $e;
            }
            EquipmentModel::setStatus($equipmentId, $ownerId, 'retired');
            $outcome = 'retired';
        }
        if ($outcome === 'deleted') {
            foreach ($paths as $path) {
                Upload::discard($path);
            }
        }

        Response::ok(['equipment_id' => $equipmentId, 'outcome' => $outcome]);
    }

    /** POST /renting-party/equipment/{id}/photos — body: {photo: {name, data}} */
    public static function storePhoto(array $params = []): void
    {
        $current     = self::findOr404($params);
        $equipmentId = (int) $current['equipment_id'];
        if ($current['status'] === 'retired') {
            Response::error('This listing has been removed and can no longer be changed.', 409);
        }
        if (EquipmentPhotoModel::countFor($equipmentId) >= self::MAX_PHOTOS) {
            Response::error('A listing can have at most ' . self::MAX_PHOTOS . ' photos. Remove one first.', 409);
        }

        $photo = Upload::prepare(Router::jsonBody()['photo'] ?? null, Upload::IMAGES, self::MAX_PHOTO_BYTES, 'Photo');
        if (is_string($photo)) {
            Response::error('Please fix the highlighted fields.', 422, ['photo' => $photo]);
        }

        $path = Upload::store($photo);
        try {
            $photoId = EquipmentPhotoModel::insert($equipmentId, $path);
        } catch (Throwable $e) {
            Upload::discard($path);
            throw $e;
        }

        Response::ok(['photo_id' => $photoId, 'photos' => self::presentPhotos($equipmentId)], 201);
    }

    /** POST /renting-party/equipment/{id}/photos/{photoId}/cover */
    public static function coverPhoto(array $params = []): void
    {
        $current     = self::findOr404($params);
        $equipmentId = (int) $current['equipment_id'];
        $photo       = self::photoOr404($params, $equipmentId);
        EquipmentPhotoModel::setCover((int) $photo['photo_id'], $equipmentId);
        Response::ok(['photos' => self::presentPhotos($equipmentId)]);
    }

    /** DELETE /renting-party/equipment/{id}/photos/{photoId} */
    public static function destroyPhoto(array $params = []): void
    {
        $current     = self::findOr404($params);
        $equipmentId = (int) $current['equipment_id'];
        $photo       = self::photoOr404($params, $equipmentId);

        EquipmentPhotoModel::delete((int) $photo['photo_id'], $equipmentId);
        Upload::discard((string) $photo['file_path']);

        // Removing the cover promotes the next photo, so the card never goes blank.
        $remaining = EquipmentPhotoModel::forEquipment($equipmentId);
        if ((bool) $photo['is_cover'] && $remaining !== []) {
            EquipmentPhotoModel::setCover((int) $remaining[0]['photo_id'], $equipmentId);
        }
        Response::ok(['photos' => self::presentPhotos($equipmentId)]);
    }

    // ------------------------------------------------------------- helpers

    /**
     * Validates a whole listing (common fields + the type's spec values),
     * ending the request with 422 and a per-field map when anything is wrong.
     *
     * @param array<string,mixed>|null $current the listing being edited (null on create)
     * @return array{0:array<string,mixed>,1:array<int,array<string,mixed>>} listing fields and spec rows
     */
    private static function readListing(array $in, ?array $current): array
    {
        $errors = [];

        // The type: must be active, except that an existing listing may keep
        // a type that has since been deactivated.
        $typeId = filter_var($in['type_id'] ?? null, FILTER_VALIDATE_INT);
        $type   = null;
        if ($typeId !== false && $typeId > 0) {
            $keeping = $current !== null && (int) $current['type_id'] === $typeId;
            $type    = EquipmentCategoryModel::findType($typeId, !$keeping);
        }
        if ($type === null) {
            $errors['type_id'] = 'Select an equipment type.';
        }

        $title       = self::str($in, 'title');
        $brand       = self::str($in, 'brand');
        $model       = self::str($in, 'model');
        $year        = self::num($in, 'year_made');
        $serial      = self::str($in, 'serial_no');
        $condition   = self::str($in, 'condition_grade');
        $district    = self::str($in, 'district');
        $address     = self::str($in, 'address');
        $rate        = self::num($in, 'daily_rate_lkr');
        $deposit     = self::num($in, 'deposit_lkr');
        $quantity    = self::num($in, 'quantity');
        $description = self::str($in, 'description');
        $extraSpecs  = self::str($in, 'extra_specs');
        $status      = self::str($in, 'status');

        $checks = [
            'title'           => Validator::required($title, 'Title') ?? Validator::maxLength($title, 150, 'Title'),
            'brand'           => Validator::maxLength($brand, 80, 'Brand'),
            'model'           => Validator::maxLength($model, 80, 'Model'),
            'year_made'       => Validator::intRange($year, 1950, (int) date('Y') + 1, 'Year'),
            'serial_no'       => Validator::maxLength($serial, 80, 'Serial / tag ID'),
            'condition_grade' => Validator::oneOf($condition, array_keys(self::CONDITIONS), 'condition'),
            'district'        => Validator::oneOf($district, self::DISTRICTS, 'district'),
            'address'         => Validator::required($address, 'Yard / address') ?? Validator::maxLength($address, 255, 'Yard / address'),
            'daily_rate_lkr'  => Validator::required($rate, 'Daily rate') ?? Validator::money($rate, 'Daily rate'),
            'deposit_lkr'     => Validator::money($deposit, 'Deposit'),
            'quantity'        => Validator::intRange($quantity, 1, 100000, 'Quantity'),
            'description'     => Validator::maxLength($description, 2000, 'Description'),
            'extra_specs'     => Validator::maxLength($extraSpecs, 1000, 'Specifications'),
            'status'          => $status === '' ? null : Validator::oneOf($status, self::EDITABLE_STATUSES, 'status'),
        ];
        foreach ($checks as $field => $message) {
            if ($message !== null) {
                $errors[$field] = $message;
            }
        }
        if (!isset($errors['daily_rate_lkr']) && (float) $rate <= 0) {
            $errors['daily_rate_lkr'] = 'Daily rate must be more than zero.';
        }

        $specRows = [];
        if ($type !== null) {
            [$specRows, $specErrors] = EquipmentListingService::validateSpecs(
                SpecFieldModel::forType((int) $type['type_id']),
                $in['specs'] ?? []
            );
            $errors += $specErrors;
        }

        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        $listing = [
            'type_id'            => (int) $type['type_id'],
            'title'              => $title,
            'brand'              => $brand === '' ? null : $brand,
            'model'              => $model === '' ? null : $model,
            'year_made'          => $year === '' ? null : (int) $year,
            'serial_no'          => $serial === '' ? null : $serial,
            'condition_grade'    => $condition,
            'district'           => $district,
            'address'            => $address,
            'daily_rate_lkr'     => $rate,
            'deposit_lkr'        => $deposit === '' ? '0' : $deposit,
            'quantity'           => $quantity === '' ? 1 : (int) $quantity,
            'description'        => $description === '' ? null : $description,
            // Only "Other ..." types describe their specs in free text.
            'extra_specs'        => ((bool) $type['is_other'] && $extraSpecs !== '') ? $extraSpecs : null,
            'status'             => $status !== '' ? $status : ($current['status'] ?? 'available'),
        ];
        return [$listing, $specRows];
    }

    /**
     * The fields a card needs. DECIMAL columns come back from PDO as strings,
     * so the numbers are cast here.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    public static function presentSummary(array $row): array
    {
        $id     = (int) $row['equipment_id'];
        $status = (string) $row['status'];
        return [
            'equipment_id'       => $id,
            'title'              => $row['title'],
            'brand'              => $row['brand'],
            'model'              => $row['model'],
            'type_id'            => (int) $row['type_id'],
            'type_name'          => $row['type_name'],
            'is_other'           => (bool) $row['is_other'],
            'category_id'        => (int) $row['category_id'],
            'category_name'      => $row['category_name'],
            'category_icon'      => $row['category_icon'],
            'condition_grade'    => $row['condition_grade'],
            'condition_label'    => self::CONDITIONS[$row['condition_grade']] ?? $row['condition_grade'],
            'district'           => $row['district'],
            'daily_rate_lkr'     => (float) $row['daily_rate_lkr'],
            'deposit_lkr'        => (float) $row['deposit_lkr'],
            'quantity'           => (int) $row['quantity'],
            'status'             => $status,
            'status_label'       => self::STATUSES[$status] ?? $status,
            'cover_photo_url'    => $row['cover_photo_id'] === null
                ? null
                : '/equipment/' . $id . '/photos/' . (int) $row['cover_photo_id'],
            'updated_at'         => $row['updated_at'],
        ];
    }

    /** @return array<string,mixed> */
    private static function presentDetail(array $row): array
    {
        $id     = (int) $row['equipment_id'];
        $fields = SpecFieldModel::forType((int) $row['type_id']);
        return self::presentSummary($row) + [
            'year_made'   => $row['year_made'] === null ? null : (int) $row['year_made'],
            'serial_no'   => $row['serial_no'],
            'address'     => $row['address'],
            'description' => $row['description'],
            'extra_specs' => $row['extra_specs'],
            'type_active' => (bool) $row['type_active'],
            'specs'       => EquipmentListingService::presentSpecs($fields, EquipmentSpecValueModel::forEquipment($id)),
            'photos'      => self::presentPhotos($id),
            'created_at'  => $row['created_at'],
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private static function presentPhotos(int $equipmentId): array
    {
        return array_map(static fn (array $p): array => [
            'photo_id' => (int) $p['photo_id'],
            'is_cover' => (bool) $p['is_cover'],
            'url'      => '/equipment/' . $equipmentId . '/photos/' . (int) $p['photo_id'],
        ], EquipmentPhotoModel::forEquipment($equipmentId));
    }

    /**
     * This renting party's listing for the {id} path segment, or a 404. Another
     * party's listing is indistinguishable from one that doesn't exist.
     *
     * @return array<string,mixed>
     */
    private static function findOr404(array $params): array
    {
        $id  = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $row = ($id === false || $id < 1) ? null : EquipmentModel::findForOwner($id, (int) Auth::userId());
        if ($row === null) {
            Response::error('Listing not found.', 404);
        }
        return $row;
    }

    /** @return array<string,mixed> */
    private static function photoOr404(array $params, int $equipmentId): array
    {
        $id  = filter_var($params['photoId'] ?? null, FILTER_VALIDATE_INT);
        $row = ($id === false || $id < 1) ? null : EquipmentPhotoModel::find($id, $equipmentId);
        if ($row === null) {
            Response::error('Photo not found.', 404);
        }
        return $row;
    }

    /** Trimmed string input, or '' when missing / not a string. */
    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }

    /** A number sent either as a JSON number or a numeric string, as a trimmed string. */
    private static function num(array $in, string $key): string
    {
        $value = $in[$key] ?? null;
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }
        return is_string($value) ? trim($value) : '';
    }
}
