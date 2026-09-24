<?php
/**
 * SQL for the two catalogue levels: `equipment_categories` and
 * `equipment_types`. The catalogue is public read-only data; only admins
 * change it (through CatalogueService).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class EquipmentCategoryModel
{
    private const CATEGORY_COLUMNS = 'category_id, slug, name, icon, sort_order, is_active';

    private const TYPE_COLUMNS =
        't.type_id, t.category_id, t.slug, t.name, t.is_other, t.sort_order, t.is_active';

    /** @return array<int,array<string,mixed>> categories in display order */
    public static function categories(bool $activeOnly): array
    {
        $stmt = getDbConnection()->query(
            'SELECT ' . self::CATEGORY_COLUMNS . '
               FROM equipment_categories'
            . ($activeOnly ? ' WHERE is_active = 1' : '') . '
              ORDER BY sort_order, name'
        );
        return $stmt->fetchAll();
    }

    /**
     * Every type with the number of spec fields it defines. With $activeOnly,
     * types of inactive categories are left out too.
     *
     * @return array<int,array<string,mixed>> types in display order ("Other" last)
     */
    public static function types(bool $activeOnly): array
    {
        $stmt = getDbConnection()->query(
            'SELECT ' . self::TYPE_COLUMNS . ',
                    (SELECT COUNT(*) FROM equipment_spec_fields f
                      WHERE f.type_id = t.type_id) AS field_count
               FROM equipment_types t
               JOIN equipment_categories c ON c.category_id = t.category_id'
            . ($activeOnly ? ' WHERE t.is_active = 1 AND c.is_active = 1' : '') . '
              ORDER BY t.is_other, t.sort_order, t.name'
        );
        return $stmt->fetchAll();
    }

    /**
     * Listings customers can see (anything not retired), counted per type.
     *
     * @return array<int,int> type_id => count
     */
    public static function listingCountsByType(): array
    {
        $stmt = getDbConnection()->query(
            "SELECT type_id, COUNT(*) AS n
               FROM equipment
              WHERE status <> 'retired'
              GROUP BY type_id"
        );
        $counts = [];
        foreach ($stmt->fetchAll() as $row) {
            $counts[(int) $row['type_id']] = (int) $row['n'];
        }
        return $counts;
    }

    /** @return array<string,mixed>|null */
    public static function findCategory(int $categoryId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT ' . self::CATEGORY_COLUMNS . '
               FROM equipment_categories WHERE category_id = :id'
        );
        $stmt->execute([':id' => $categoryId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * A type with its category's name and active flag. With $activeOnly, a
     * type (or a type whose category) is deactivated reads as missing.
     *
     * @return array<string,mixed>|null
     */
    public static function findType(int $typeId, bool $activeOnly): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT ' . self::TYPE_COLUMNS . ', c.name AS category_name,
                    c.slug AS category_slug, c.is_active AS category_active
               FROM equipment_types t
               JOIN equipment_categories c ON c.category_id = t.category_id
              WHERE t.type_id = :id'
            . ($activeOnly ? ' AND t.is_active = 1 AND c.is_active = 1' : '')
        );
        $stmt->execute([':id' => $typeId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** Whether a category (other than $exceptId) already uses this name. */
    public static function categoryNameExists(string $name, int $exceptId = 0): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM equipment_categories
              WHERE name = :name AND category_id <> :except_id LIMIT 1'
        );
        $stmt->execute([':name' => $name, ':except_id' => $exceptId]);
        return $stmt->fetchColumn() !== false;
    }

    /** Whether another type in the same category already uses this name. */
    public static function typeNameExists(int $categoryId, string $name, int $exceptId = 0): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM equipment_types
              WHERE category_id = :category_id AND name = :name
                AND type_id <> :except_id LIMIT 1'
        );
        $stmt->execute([':category_id' => $categoryId, ':name' => $name, ':except_id' => $exceptId]);
        return $stmt->fetchColumn() !== false;
    }

    public static function categorySlugExists(string $slug): bool
    {
        $stmt = getDbConnection()->prepare('SELECT 1 FROM equipment_categories WHERE slug = :slug');
        $stmt->execute([':slug' => $slug]);
        return $stmt->fetchColumn() !== false;
    }

    public static function typeSlugExists(string $slug): bool
    {
        $stmt = getDbConnection()->prepare('SELECT 1 FROM equipment_types WHERE slug = :slug');
        $stmt->execute([':slug' => $slug]);
        return $stmt->fetchColumn() !== false;
    }

    /** @return int the new category_id */
    public static function insertCategory(string $slug, string $name, string $icon, int $sortOrder): int
    {
        $db   = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO equipment_categories (slug, name, icon, sort_order)
             VALUES (:slug, :name, :icon, :sort_order)'
        );
        $stmt->execute([':slug' => $slug, ':name' => $name, ':icon' => $icon, ':sort_order' => $sortOrder]);
        return (int) $db->lastInsertId();
    }

    public static function updateCategory(int $categoryId, string $name, string $icon, int $sortOrder): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE equipment_categories
                SET name = :name, icon = :icon, sort_order = :sort_order
              WHERE category_id = :id'
        );
        $stmt->execute([':name' => $name, ':icon' => $icon, ':sort_order' => $sortOrder, ':id' => $categoryId]);
    }

    public static function setCategoryActive(int $categoryId, bool $active): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE equipment_categories SET is_active = :active WHERE category_id = :id'
        );
        $stmt->execute([':active' => $active ? 1 : 0, ':id' => $categoryId]);
    }

    /** The next sort_order after the last category, so new ones go at the end. */
    public static function nextCategorySortOrder(): int
    {
        return (int) getDbConnection()
            ->query('SELECT COALESCE(MAX(sort_order), 0) + 10 FROM equipment_categories')
            ->fetchColumn();
    }

    /** The next sort_order after the last real type of a category. */
    public static function nextTypeSortOrder(int $categoryId): int
    {
        $stmt = getDbConnection()->prepare(
            'SELECT COALESCE(MAX(sort_order), 0) + 10 FROM equipment_types
              WHERE category_id = :category_id AND is_other = 0'
        );
        $stmt->execute([':category_id' => $categoryId]);
        return (int) $stmt->fetchColumn();
    }

    /** @return int the new type_id */
    public static function insertType(int $categoryId, string $slug, string $name, bool $isOther, int $sortOrder): int
    {
        $db   = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order)
             VALUES (:category_id, :slug, :name, :is_other, :sort_order)'
        );
        $stmt->execute([
            ':category_id' => $categoryId,
            ':slug'        => $slug,
            ':name'        => $name,
            ':is_other'    => $isOther ? 1 : 0,
            ':sort_order'  => $sortOrder,
        ]);
        return (int) $db->lastInsertId();
    }

    public static function renameType(int $typeId, string $name): void
    {
        $stmt = getDbConnection()->prepare('UPDATE equipment_types SET name = :name WHERE type_id = :id');
        $stmt->execute([':name' => $name, ':id' => $typeId]);
    }

    /** Keeps a category's "Other ..." type named after the category. */
    public static function renameOtherType(int $categoryId, string $name): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE equipment_types SET name = :name
              WHERE category_id = :category_id AND is_other = 1'
        );
        $stmt->execute([':name' => $name, ':category_id' => $categoryId]);
    }

    public static function setTypeActive(int $typeId, bool $active): void
    {
        $stmt = getDbConnection()->prepare('UPDATE equipment_types SET is_active = :active WHERE type_id = :id');
        $stmt->execute([':active' => $active ? 1 : 0, ':id' => $typeId]);
    }
}
