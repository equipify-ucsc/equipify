<?php
/**
 * The public, read-only equipment catalogue: categories -> types (with how
 * many listings each has), and each type's spec field definitions. No login
 * needed: the Browsing page uses it for logged-out visitors too.
 *
 * The admin side (AdminCatalogueController) reuses tree() and presentField()
 * so both sides describe the catalogue the same way.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/EquipmentCategoryModel.php';
require_once __DIR__ . '/../models/SpecFieldModel.php';

final class CatalogueController
{
    /**
     * GET /catalogue[?nonempty=1]
     *
     * nonempty=1 leaves out types and categories that have no listings yet, so
     * customers are never offered a filter that can only return nothing.
     */
    public static function index(array $params = []): void
    {
        Response::ok(['categories' => self::tree(true, ListQuery::flag('nonempty'))]);
    }

    /** GET /catalogue/types/{id}/fields */
    public static function fields(array $params = []): void
    {
        $typeId = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $type   = ($typeId === false || $typeId < 1) ? null : EquipmentCategoryModel::findType($typeId, true);
        if ($type === null) {
            Response::error('Equipment type not found.', 404);
        }

        Response::ok([
            'type_id'       => (int) $type['type_id'],
            'name'          => $type['name'],
            'is_other'      => (bool) $type['is_other'],
            'category_id'   => (int) $type['category_id'],
            'category_name' => $type['category_name'],
            'fields'        => array_map([self::class, 'presentField'], SpecFieldModel::forType((int) $type['type_id'])),
        ]);
    }

    // ------------------------------------------------------------- shared

    /**
     * Categories with their types nested, each with a listing count.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function tree(bool $activeOnly, bool $nonEmptyOnly): array
    {
        $counts = EquipmentCategoryModel::listingCountsByType();

        $typesByCategory = [];
        foreach (EquipmentCategoryModel::types($activeOnly) as $type) {
            $count = $counts[(int) $type['type_id']] ?? 0;
            if ($nonEmptyOnly && $count === 0) {
                continue;
            }
            $typesByCategory[(int) $type['category_id']][] = [
                'type_id'       => (int) $type['type_id'],
                'slug'          => $type['slug'],
                'name'          => $type['name'],
                'is_other'      => (bool) $type['is_other'],
                'is_active'     => (bool) $type['is_active'],
                'field_count'   => (int) $type['field_count'],
                'listing_count' => $count,
            ];
        }

        $categories = [];
        foreach (EquipmentCategoryModel::categories($activeOnly) as $category) {
            $types = $typesByCategory[(int) $category['category_id']] ?? [];
            if ($nonEmptyOnly && $types === []) {
                continue;
            }
            $categories[] = [
                'category_id'   => (int) $category['category_id'],
                'slug'          => $category['slug'],
                'name'          => $category['name'],
                'icon'          => $category['icon'],
                'sort_order'    => (int) $category['sort_order'],
                'is_active'     => (bool) $category['is_active'],
                'listing_count' => array_sum(array_column($types, 'listing_count')),
                'types'         => $types,
            ];
        }
        return $categories;
    }

    /**
     * @param array<string,mixed> $row an equipment_spec_fields row
     * @return array<string,mixed>
     */
    public static function presentField(array $row): array
    {
        $options = $row['options'] === null ? null : json_decode((string) $row['options'], true);
        return [
            'spec_field_id' => (int) $row['spec_field_id'],
            'field_key'     => $row['field_key'],
            'label'         => $row['label'],
            'data_type'     => $row['data_type'],
            'unit'          => $row['unit'],
            'options'       => is_array($options) ? $options : null,
            'is_required'   => (bool) $row['is_required'],
            'is_filterable' => (bool) $row['is_filterable'],
        ];
    }
}
