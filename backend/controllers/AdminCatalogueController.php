<?php
/**
 * Admin management of the equipment catalogue: categories, equipment types
 * and each type's spec fields.
 *
 * Nothing in the catalogue is ever deleted, only deactivated, because listings
 * point at their type (and types at their category). Growth is meant to happen
 * through new types; new categories should be rare so the customer's first
 * filter step stays short.
 *
 * Rules checked here (shape) and in CatalogueService (stored data):
 *   - field_key matches ^[a-z][a-z0-9_]{1,49}$ and is unique within the type
 *   - select / multiselect fields need 2+ options; other types have none
 *   - at most MAX_FILTERABLE filterable fields per type, and free-text fields
 *     can't be filterable (an exact-match filter on free text finds nothing)
 *   - "Other ..." types have no spec fields and follow their category's name
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/EquipmentCategoryModel.php';
require_once __DIR__ . '/../models/SpecFieldModel.php';
require_once __DIR__ . '/../services/CatalogueService.php';
require_once __DIR__ . '/CatalogueController.php';

final class AdminCatalogueController
{
    public const MAX_FILTERABLE = 3;

    private const MAX_FIELDS  = 15;
    private const MAX_OPTIONS = 30;

    private const DATA_TYPES = ['number', 'text', 'boolean', 'select', 'multiselect'];

    /** GET /admin/catalogue — the whole tree, inactive entries included. */
    public static function index(array $params = []): void
    {
        Response::ok([
            'categories'     => CatalogueController::tree(false, false),
            'field_keys'     => array_map(static fn (array $k): array => [
                'field_key' => $k['field_key'],
                'label'     => $k['label'],
                'data_type' => $k['data_type'],
                'unit'      => $k['unit'],
                'used_by'   => (int) $k['used_by'],
            ], SpecFieldModel::knownKeys()),
            'max_filterable' => self::MAX_FILTERABLE,
        ]);
    }

    /** POST /admin/catalogue/categories */
    public static function storeCategory(array $params = []): void
    {
        [$name, $icon] = self::readCategory(Router::jsonBody(), 0);
        $categoryId    = CatalogueService::createCategory($name, $icon);
        Response::ok(self::categoryPayload($categoryId), 201);
    }

    /** PUT /admin/catalogue/categories/{id} */
    public static function updateCategory(array $params = []): void
    {
        $category = self::categoryOr404($params);
        $in       = Router::jsonBody();
        [$name, $icon] = self::readCategory($in, (int) $category['category_id']);

        $sortOrder = self::num($in, 'sort_order');
        if ($m = Validator::intRange($sortOrder, 0, 65535, 'Display order')) {
            Response::error('Please fix the highlighted fields.', 422, ['sort_order' => $m]);
        }
        CatalogueService::updateCategory(
            (int) $category['category_id'],
            $name,
            $icon,
            $sortOrder === '' ? (int) $category['sort_order'] : (int) $sortOrder
        );
        Response::ok(self::categoryPayload((int) $category['category_id']));
    }

    /** POST /admin/catalogue/categories/{id}/deactivate */
    public static function deactivateCategory(array $params = []): void
    {
        $category = self::categoryOr404($params);
        EquipmentCategoryModel::setCategoryActive((int) $category['category_id'], false);
        Response::ok(self::categoryPayload((int) $category['category_id']));
    }

    /** POST /admin/catalogue/categories/{id}/activate */
    public static function activateCategory(array $params = []): void
    {
        $category = self::categoryOr404($params);
        EquipmentCategoryModel::setCategoryActive((int) $category['category_id'], true);
        Response::ok(self::categoryPayload((int) $category['category_id']));
    }

    /** GET /admin/catalogue/types/{id} */
    public static function showType(array $params = []): void
    {
        Response::ok(self::typePayload((int) self::typeOr404($params)['type_id']));
    }

    /** POST /admin/catalogue/types — body: {category_id, name, fields: [...]} */
    public static function storeType(array $params = []): void
    {
        $in         = Router::jsonBody();
        $categoryId = filter_var($in['category_id'] ?? null, FILTER_VALIDATE_INT);
        $category   = ($categoryId === false || $categoryId < 1) ? null : EquipmentCategoryModel::findCategory($categoryId);
        if ($category === null) {
            Response::error('Please fix the highlighted fields.', 422, ['category_id' => 'Select a valid category.']);
        }

        [$name, $fields] = self::readTypeInput($in, (int) $categoryId, 0);
        $typeId          = self::save(null, (int) $categoryId, $name, $fields);
        Response::ok(self::typePayload($typeId), 201);
    }

    /** PUT /admin/catalogue/types/{id} — body: {name, fields: [...]} */
    public static function updateType(array $params = []): void
    {
        $type = self::typeOr404($params);
        if ((bool) $type['is_other']) {
            Response::error('The "Other" type follows its category and has no spec fields, so it cannot be edited.', 409);
        }

        [$name, $fields] = self::readTypeInput(Router::jsonBody(), (int) $type['category_id'], (int) $type['type_id']);
        self::save((int) $type['type_id'], (int) $type['category_id'], $name, $fields);
        Response::ok(self::typePayload((int) $type['type_id']));
    }

    /** POST /admin/catalogue/types/{id}/deactivate */
    public static function deactivateType(array $params = []): void
    {
        $type = self::typeOr404($params);
        if ((bool) $type['is_other']) {
            Response::error('Every category keeps its "Other" type, so it cannot be deactivated.', 409);
        }
        EquipmentCategoryModel::setTypeActive((int) $type['type_id'], false);
        Response::ok(self::typePayload((int) $type['type_id']));
    }

    /** POST /admin/catalogue/types/{id}/activate */
    public static function activateType(array $params = []): void
    {
        $type = self::typeOr404($params);
        EquipmentCategoryModel::setTypeActive((int) $type['type_id'], true);
        Response::ok(self::typePayload((int) $type['type_id']));
    }

    // ------------------------------------------------------------- helpers

    /**
     * Runs CatalogueService::saveType(), turning a stored-data rule it refuses
     * into a 409 the admin can read.
     */
    private static function save(?int $typeId, int $categoryId, string $name, array $fields): int
    {
        try {
            return CatalogueService::saveType($typeId, $categoryId, $name, $fields);
        } catch (DomainException $e) {
            Response::error($e->getMessage(), 409);
        }
    }

    /** @return array{0:string,1:string} name and icon */
    private static function readCategory(array $in, int $exceptId): array
    {
        $name = self::str($in, 'name');
        $icon = self::str($in, 'icon');

        $errors = [];
        if ($m = Validator::required($name, 'Category name') ?? Validator::maxLength($name, 80, 'Category name')) {
            $errors['name'] = $m;
        } elseif (EquipmentCategoryModel::categoryNameExists($name, $exceptId)) {
            $errors['name'] = 'A category with this name already exists.';
        }
        if ($icon === '') {
            $icon = 'category';
        } elseif (preg_match('/^[a-z0-9_]{1,40}$/', $icon) !== 1) {
            $errors['icon'] = 'Use a Material Symbols icon name, e.g. construction or local_shipping.';
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }
        return [$name, $icon];
    }

    /**
     * Validates a type's name and its full spec-field list, ending the request
     * with 422 when anything is wrong. Field errors are keyed
     * "fields.<index>.<property>" so the form can mark the exact input.
     *
     * @return array{0:string,1:array<int,array<string,mixed>>} name and fields
     */
    public static function readTypeInput(array $in, int $categoryId, int $exceptId): array
    {
        $errors = [];
        $name   = self::str($in, 'name');
        if ($m = Validator::required($name, 'Type name') ?? Validator::maxLength($name, 80, 'Type name')) {
            $errors['name'] = $m;
        } elseif (EquipmentCategoryModel::typeNameExists($categoryId, $name, $exceptId)) {
            $errors['name'] = 'This category already has a type with this name.';
        }

        $rawFields = $in['fields'] ?? [];
        if (!is_array($rawFields) || ($rawFields !== [] && array_keys($rawFields) !== range(0, count($rawFields) - 1))) {
            Response::error('Please fix the highlighted fields.', 422, ['fields' => 'Spec fields must be a list.']);
        }
        if (count($rawFields) > self::MAX_FIELDS) {
            $errors['fields'] = 'A type can have at most ' . self::MAX_FIELDS . ' spec fields.';
        }

        $fields     = [];
        $seenKeys   = [];
        $filterable = 0;
        foreach ($rawFields as $i => $raw) {
            $raw    = is_array($raw) ? $raw : [];
            $prefix = 'fields.' . $i . '.';

            $key      = strtolower(self::str($raw, 'field_key'));
            $label    = self::str($raw, 'label');
            $dataType = self::str($raw, 'data_type');
            $unit     = self::str($raw, 'unit');
            $required = ($raw['is_required'] ?? false) === true;
            $filter   = ($raw['is_filterable'] ?? false) === true;

            if (preg_match('/^[a-z][a-z0-9_]{1,49}$/', $key) !== 1) {
                $errors[$prefix . 'field_key'] = 'Use 2–50 lowercase letters, digits or _ (starting with a letter).';
            } elseif (isset($seenKeys[$key])) {
                $errors[$prefix . 'field_key'] = 'This key is already used by another field of this type.';
            }
            $seenKeys[$key] = true;

            if ($m = Validator::required($label, 'Label') ?? Validator::maxLength($label, 80, 'Label')) {
                $errors[$prefix . 'label'] = $m;
            }
            if ($m = Validator::oneOf($dataType, self::DATA_TYPES, 'data type')) {
                $errors[$prefix . 'data_type'] = $m;
            }
            if ($m = Validator::maxLength($unit, 20, 'Unit')) {
                $errors[$prefix . 'unit'] = $m;
            }

            $options = null;
            if ($dataType === 'select' || $dataType === 'multiselect') {
                $list = self::optionList($raw['options'] ?? null);
                if ($list === null) {
                    $errors[$prefix . 'options'] = 'Give 2–' . self::MAX_OPTIONS . ' different options of up to 60 characters each.';
                } else {
                    $options = json_encode($list, JSON_UNESCAPED_UNICODE);
                }
            }

            if ($filter) {
                $filterable++;
                if ($dataType === 'text') {
                    $errors[$prefix . 'is_filterable'] = 'Free-text fields cannot be filters.';
                }
            }

            $fields[] = [
                'field_key'     => $key,
                'label'         => $label,
                'data_type'     => $dataType,
                'unit'          => ($unit === '' || $dataType !== 'number') ? null : $unit,
                'options'       => $options,
                'is_required'   => $required,
                'is_filterable' => $filter,
            ];
        }
        if ($filterable > self::MAX_FILTERABLE) {
            $errors['fields'] = 'At most ' . self::MAX_FILTERABLE . ' fields can be filters, so the Browsing page stays simple.';
        }

        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }
        return [$name, $fields];
    }

    /**
     * Options sent as a list of strings (or one comma-separated string),
     * trimmed and de-duplicated. Null when there are too few or too many, or
     * one is too long.
     *
     * @param mixed $raw
     * @return string[]|null
     */
    private static function optionList($raw): ?array
    {
        if (is_string($raw)) {
            $raw = explode(',', $raw);
        }
        if (!is_array($raw)) {
            return null;
        }
        $list = [];
        foreach ($raw as $option) {
            if (!is_string($option)) {
                return null;
            }
            $option = trim($option);
            if ($option === '') {
                continue;
            }
            if (mb_strlen($option) > 60) {
                return null;
            }
            $list[mb_strtolower($option)] = $option;
        }
        $list = array_values($list);
        return (count($list) < 2 || count($list) > self::MAX_OPTIONS) ? null : $list;
    }

    /** @return array<string,mixed> */
    private static function categoryPayload(int $categoryId): array
    {
        foreach (CatalogueController::tree(false, false) as $category) {
            if ($category['category_id'] === $categoryId) {
                return $category;
            }
        }
        return [];
    }

    /** @return array<string,mixed> */
    private static function typePayload(int $typeId): array
    {
        $type = (array) EquipmentCategoryModel::findType($typeId, false);
        return [
            'type_id'       => (int) $type['type_id'],
            'category_id'   => (int) $type['category_id'],
            'category_name' => $type['category_name'],
            'slug'          => $type['slug'],
            'name'          => $type['name'],
            'is_other'      => (bool) $type['is_other'],
            'is_active'     => (bool) $type['is_active'],
            'fields'        => array_map([CatalogueController::class, 'presentField'], SpecFieldModel::forType($typeId)),
        ];
    }

    /** @return array<string,mixed> */
    private static function categoryOr404(array $params): array
    {
        $id  = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $row = ($id === false || $id < 1) ? null : EquipmentCategoryModel::findCategory($id);
        if ($row === null) {
            Response::error('Category not found.', 404);
        }
        return $row;
    }

    /** @return array<string,mixed> */
    private static function typeOr404(array $params): array
    {
        $id  = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $row = ($id === false || $id < 1) ? null : EquipmentCategoryModel::findType($id, false);
        if ($row === null) {
            Response::error('Equipment type not found.', 404);
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
