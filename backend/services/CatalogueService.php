<?php
/**
 * Admin changes to the equipment catalogue that touch several rows at once,
 * each in one transaction:
 *
 *   createCategory()  the category plus its "Other ..." catch-all type
 *   renameCategory()  the category and its "Other ..." type's name
 *   saveType()        a type plus its whole spec-field list, synced by key
 *   approveRequest()  a new type from a renting party's request + the request
 *
 * Input shape is validated by AdminCatalogueController; this class enforces the
 * rules that depend on what is already stored. A rule broken here throws
 * DomainException with a message meant for the admin (the controller answers
 * 409), and nothing is changed.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../models/EquipmentCategoryModel.php';
require_once __DIR__ . '/../models/SpecFieldModel.php';
require_once __DIR__ . '/../models/EquipmentTypeRequestModel.php';

final class CatalogueService
{
    /** @return int the new category_id */
    public static function createCategory(string $name, string $icon): int
    {
        return self::inTransaction(static function () use ($name, $icon): int {
            $categoryId = EquipmentCategoryModel::insertCategory(
                self::uniqueSlug($name, [EquipmentCategoryModel::class, 'categorySlugExists']),
                $name,
                $icon,
                EquipmentCategoryModel::nextCategorySortOrder()
            );
            EquipmentCategoryModel::insertType(
                $categoryId,
                self::uniqueSlug('other ' . $name, [EquipmentCategoryModel::class, 'typeSlugExists']),
                'Other ' . $name,
                true,
                999
            );
            return $categoryId;
        });
    }

    public static function updateCategory(int $categoryId, string $name, string $icon, int $sortOrder): void
    {
        self::inTransaction(static function () use ($categoryId, $name, $icon, $sortOrder): int {
            EquipmentCategoryModel::updateCategory($categoryId, $name, $icon, $sortOrder);
            EquipmentCategoryModel::renameOtherType($categoryId, 'Other ' . $name);
            return $categoryId;
        });
    }

    /**
     * Creates a type ($typeId null) or updates one, then makes its spec fields
     * match $fields exactly, matched on field_key:
     *   - a key in both is updated (its data type can't change once listings
     *     have answered it, because stored values would stop making sense),
     *   - a new key is inserted,
     *   - a missing key is deleted, unless listings have answered it.
     *
     * @param array<int,array{field_key:string,label:string,data_type:string,
     *        unit:?string,options:?string,is_required:bool,is_filterable:bool}> $fields
     * @return int the type_id
     */
    public static function saveType(?int $typeId, int $categoryId, string $name, array $fields): int
    {
        return self::inTransaction(static function () use ($typeId, $categoryId, $name, $fields): int {
            return self::writeType($typeId, $categoryId, $name, $fields);
        });
    }

    /**
     * Approving a renting party's new-type request: creates the type (as
     * saveType() does) and marks the request approved, together.
     *
     * @return int the new type_id
     */
    public static function approveRequest(int $requestId, int $adminId, int $categoryId, string $name, array $fields): int
    {
        return self::inTransaction(static function () use ($requestId, $adminId, $categoryId, $name, $fields): int {
            $typeId = self::writeType(null, $categoryId, $name, $fields);
            if (!EquipmentTypeRequestModel::decide($requestId, 'approved', $adminId, null, $typeId)) {
                throw new DomainException('This request has already been reviewed.');
            }
            return $typeId;
        });
    }

    /** saveType() without its own transaction. */
    private static function writeType(?int $typeId, int $categoryId, string $name, array $fields): int
    {
        if ($typeId === null) {
            $typeId = EquipmentCategoryModel::insertType(
                $categoryId,
                self::uniqueSlug($name, [EquipmentCategoryModel::class, 'typeSlugExists']),
                $name,
                false,
                EquipmentCategoryModel::nextTypeSortOrder($categoryId)
            );
        } else {
            EquipmentCategoryModel::renameType($typeId, $name);
        }

        $existing = [];
        foreach (SpecFieldModel::forType($typeId) as $row) {
            $existing[(string) $row['field_key']] = $row;
        }

        foreach ($fields as $i => $field) {
            $sortOrder = ($i + 1) * 10;
            $current   = $existing[$field['field_key']] ?? null;
            if ($current === null) {
                SpecFieldModel::insert($typeId, $field, $sortOrder);
                continue;
            }
            $fieldId = (int) $current['spec_field_id'];
            if ($current['data_type'] !== $field['data_type'] && SpecFieldModel::hasValues($fieldId)) {
                throw new DomainException(
                    '"' . $current['label'] . '" already has values in listings, so its data type cannot change.'
                );
            }
            SpecFieldModel::update($fieldId, $field, $sortOrder);
            unset($existing[$field['field_key']]);
        }

        foreach ($existing as $row) {
            if (SpecFieldModel::hasValues((int) $row['spec_field_id'])) {
                throw new DomainException(
                    '"' . $row['label'] . '" already has values in listings, so it cannot be removed.'
                );
            }
            SpecFieldModel::delete((int) $row['spec_field_id']);
        }

        return $typeId;
    }

    /**
     * "Bar Bender & Cutter" -> "bar-bender-cutter", with -2, -3 ... appended
     * when the slug is taken.
     *
     * @param callable(string):bool $exists
     */
    private static function uniqueSlug(string $name, callable $exists): string
    {
        $base = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($name)), '-');
        $base = substr($base !== '' ? $base : 'item', 0, 70);
        $slug = $base;
        for ($n = 2; $exists($slug); $n++) {
            $slug = $base . '-' . $n;
        }
        return $slug;
    }

    /**
     * Runs $work in a transaction and returns its result; rolls back and
     * rethrows on any exception.
     */
    private static function inTransaction(callable $work): int
    {
        $db = getDbConnection();
        $db->beginTransaction();
        try {
            $result = $work();
            $db->commit();
            return $result;
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }
}
