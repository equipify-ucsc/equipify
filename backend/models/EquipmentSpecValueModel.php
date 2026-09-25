<?php
/**
 * SQL for `equipment_spec_values`: one listing's answers to its type's spec
 * fields. The owner check happens before these are called (the listing was
 * already loaded with its owner_id), so these work on an equipment_id alone.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class EquipmentSpecValueModel
{
    /** @return array<int,array<string,mixed>> spec_field_id, value_text, value_number */
    public static function forEquipment(int $equipmentId): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT spec_field_id, value_text, value_number
               FROM equipment_spec_values WHERE equipment_id = :id'
        );
        $stmt->execute([':id' => $equipmentId]);
        return $stmt->fetchAll();
    }

    /**
     * Replaces every value of a listing (used on create, edit and type change).
     *
     * @param array<int,array{spec_field_id:int,value_text:?string,value_number:?string}> $values
     */
    public static function replaceAll(int $equipmentId, array $values): void
    {
        $db = getDbConnection();
        $db->prepare('DELETE FROM equipment_spec_values WHERE equipment_id = :id')
           ->execute([':id' => $equipmentId]);

        $stmt = $db->prepare(
            'INSERT INTO equipment_spec_values (equipment_id, spec_field_id, value_text, value_number)
             VALUES (:equipment_id, :spec_field_id, :value_text, :value_number)'
        );
        foreach ($values as $v) {
            $stmt->execute([
                ':equipment_id'  => $equipmentId,
                ':spec_field_id' => $v['spec_field_id'],
                ':value_text'    => $v['value_text'],
                ':value_number'  => $v['value_number'],
            ]);
        }
    }
}
