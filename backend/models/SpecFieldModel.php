<?php
/**
 * SQL for `equipment_spec_fields`: the spec attributes each equipment type
 * defines (Diesel Generator -> power output, phase, ...).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class SpecFieldModel
{
    private const COLUMNS =
        'spec_field_id, type_id, field_key, label, data_type, unit, options,
         is_required, is_filterable, sort_order';

    /** @return array<int,array<string,mixed>> the type's fields in form order */
    public static function forType(int $typeId): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT ' . self::COLUMNS . '
               FROM equipment_spec_fields
              WHERE type_id = :type_id
              ORDER BY sort_order, spec_field_id'
        );
        $stmt->execute([':type_id' => $typeId]);
        return $stmt->fetchAll();
    }

    /**
     * @param array{field_key:string,label:string,data_type:string,unit:?string,
     *              options:?string,is_required:bool,is_filterable:bool} $f
     */
    public static function insert(int $typeId, array $f, int $sortOrder): void
    {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO equipment_spec_fields
                 (type_id, field_key, label, data_type, unit, options,
                  is_required, is_filterable, sort_order)
             VALUES (:type_id, :field_key, :label, :data_type, :unit, :options,
                     :is_required, :is_filterable, :sort_order)'
        );
        $stmt->execute(self::bind($f, $sortOrder) + [':type_id' => $typeId, ':field_key' => $f['field_key']]);
    }

    /**
     * Updates the field with this key. The key and data type identify what
     * stored values mean, so CatalogueService refuses to change a data type
     * once values exist; everything else can change freely.
     *
     * @param array{field_key:string,label:string,data_type:string,unit:?string,
     *              options:?string,is_required:bool,is_filterable:bool} $f
     */
    public static function update(int $specFieldId, array $f, int $sortOrder): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE equipment_spec_fields
                SET label = :label, data_type = :data_type, unit = :unit,
                    options = :options, is_required = :is_required,
                    is_filterable = :is_filterable, sort_order = :sort_order
              WHERE spec_field_id = :id'
        );
        $stmt->execute(self::bind($f, $sortOrder) + [':id' => $specFieldId]);
    }

    public static function delete(int $specFieldId): void
    {
        $stmt = getDbConnection()->prepare('DELETE FROM equipment_spec_fields WHERE spec_field_id = :id');
        $stmt->execute([':id' => $specFieldId]);
    }

    /** Whether any listing has already answered this field. */
    public static function hasValues(int $specFieldId): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM equipment_spec_values WHERE spec_field_id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $specFieldId]);
        return $stmt->fetchColumn() !== false;
    }

    /**
     * Every field key in the catalogue with its most common label and type,
     * so the admin form can suggest reusing a key rather than inventing a
     * near-duplicate (power_source vs power_type).
     *
     * @return array<int,array<string,mixed>>
     */
    public static function knownKeys(): array
    {
        $stmt = getDbConnection()->query(
            'SELECT field_key, MIN(label) AS label, MIN(data_type) AS data_type,
                    MIN(unit) AS unit, COUNT(*) AS used_by
               FROM equipment_spec_fields
              GROUP BY field_key
              ORDER BY field_key'
        );
        return $stmt->fetchAll();
    }

    /** @return array<string,mixed> */
    private static function bind(array $f, int $sortOrder): array
    {
        return [
            ':label'         => $f['label'],
            ':data_type'     => $f['data_type'],
            ':unit'          => $f['unit'],
            ':options'       => $f['options'],
            ':is_required'   => $f['is_required'] ? 1 : 0,
            ':is_filterable' => $f['is_filterable'] ? 1 : 0,
            ':sort_order'    => $sortOrder,
        ];
    }
}
