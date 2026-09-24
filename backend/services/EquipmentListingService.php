<?php
/**
 * A listing and its spec values change together, so create() and update()
 * write both in one transaction: a listing can never be saved with values for
 * a type it no longer has, or be left half-written.
 *
 * The spec rules live here too, because both the renting party's controller
 * (validating input) and the public browse controller (showing values) need
 * them:
 *
 *   validateSpecs()  input {field_key: value} -> rows to store, or errors
 *                    keyed "spec.<field_key>"
 *   presentSpecs()   stored rows -> [{label, unit, value, display}, ...]
 *
 * How each data type is stored (see schema/020 and 022):
 *   number       value_number (negative allowed: e.g. -18 °C)
 *   text         value_text
 *   boolean      value_text '1' / '0'
 *   select       value_text, one of the field's options
 *   multiselect  value_text, JSON array of options, in the field's order
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../models/EquipmentModel.php';
require_once __DIR__ . '/../models/EquipmentSpecValueModel.php';
require_once __DIR__ . '/../models/SpecFieldModel.php';

final class EquipmentListingService
{
    /**
     * @param array<string,mixed> $listing validated listing fields
     * @param array<int,array<string,mixed>> $specRows from validateSpecs()
     * @return int the new equipment_id
     */
    public static function create(int $ownerId, array $listing, array $specRows): int
    {
        return self::inTransaction(static function () use ($ownerId, $listing, $specRows): int {
            $equipmentId = EquipmentModel::insert($ownerId, $listing);
            EquipmentSpecValueModel::replaceAll($equipmentId, $specRows);
            return $equipmentId;
        });
    }

    /**
     * Replaces the listing's fields and all its spec values; when the type
     * changed, the old type's values are dropped with the rest.
     */
    public static function update(int $equipmentId, int $ownerId, array $listing, array $specRows): void
    {
        self::inTransaction(static function () use ($equipmentId, $ownerId, $listing, $specRows): int {
            EquipmentModel::update($equipmentId, $ownerId, $listing);
            EquipmentSpecValueModel::replaceAll($equipmentId, $specRows);
            return $equipmentId;
        });
    }

    /**
     * Checks submitted spec values against the type's field definitions.
     * Unknown keys are ignored; empty values count as "not stated".
     *
     * @param array<int,array<string,mixed>> $fields SpecFieldModel::forType() rows
     * @param mixed                          $input  {field_key: value}
     * @return array{0:array<int,array{spec_field_id:int,value_text:?string,value_number:?string}>,
     *               1:array<string,string>} rows to store, and errors
     */
    public static function validateSpecs(array $fields, $input): array
    {
        $input  = is_array($input) ? $input : [];
        $rows   = [];
        $errors = [];

        foreach ($fields as $field) {
            $key   = (string) $field['field_key'];
            $label = (string) $field['label'];
            $value = $input[$key] ?? null;
            if (is_string($value)) {
                $value = trim($value);
            }
            $empty = $value === null || $value === '' || $value === [];

            if ($empty) {
                if ((bool) $field['is_required']) {
                    $errors['spec.' . $key] = $label . ' is required.';
                }
                continue;
            }

            $text   = null;
            $number = null;
            $error  = null;
            switch ($field['data_type']) {
                case 'number':
                    $raw = is_int($value) || is_float($value) ? (string) $value : $value;
                    if (!is_string($raw) || preg_match('/^-?\d{1,9}(?:\.\d{1,3})?$/', $raw) !== 1) {
                        $error = $label . ' must be a number with at most 3 decimal places.';
                    } else {
                        $number = $raw;
                    }
                    break;

                case 'boolean':
                    if ($value === true || $value === '1' || $value === 1) {
                        $text = '1';
                    } elseif ($value === false || $value === '0' || $value === 0) {
                        $text = '0';
                    } else {
                        $error = 'Choose yes or no for ' . mb_strtolower($label) . '.';
                    }
                    break;

                case 'select':
                    $options = self::options($field);
                    if (!is_string($value) || !in_array($value, $options, true)) {
                        $error = 'Select a valid ' . mb_strtolower($label) . '.';
                    } else {
                        $text = $value;
                    }
                    break;

                case 'multiselect':
                    $options = self::options($field);
                    $picked  = is_array($value) ? $value : [$value];
                    foreach ($picked as $p) {
                        if (!is_string($p) || !in_array($p, $options, true)) {
                            $error = 'Select valid options for ' . mb_strtolower($label) . '.';
                            break;
                        }
                    }
                    if ($error === null) {
                        // Stored in the field's own order, without duplicates.
                        $text = json_encode(array_values(array_intersect($options, $picked)), JSON_UNESCAPED_UNICODE);
                    }
                    break;

                default: // text
                    if (!is_string($value)) {
                        $error = $label . ' must be text.';
                    } elseif (mb_strlen($value) > 255) {
                        $error = $label . ' must be at most 255 characters.';
                    } else {
                        $text = $value;
                    }
            }

            if ($error !== null) {
                $errors['spec.' . $key] = $error;
                continue;
            }
            $rows[] = [
                'spec_field_id' => (int) $field['spec_field_id'],
                'value_text'    => $text,
                'value_number'  => $number,
            ];
        }

        return [$rows, $errors];
    }

    /**
     * The listing's stated specs in the type's field order, each with a typed
     * value (for editing) and a display string (for showing).
     *
     * @param array<int,array<string,mixed>> $fields SpecFieldModel::forType() rows
     * @param array<int,array<string,mixed>> $stored EquipmentSpecValueModel::forEquipment() rows
     * @return array<int,array<string,mixed>>
     */
    public static function presentSpecs(array $fields, array $stored): array
    {
        $byField = [];
        foreach ($stored as $row) {
            $byField[(int) $row['spec_field_id']] = $row;
        }

        $out = [];
        foreach ($fields as $field) {
            $row = $byField[(int) $field['spec_field_id']] ?? null;
            if ($row === null) {
                continue;
            }
            $unit = $field['unit'];
            switch ($field['data_type']) {
                case 'number':
                    $value   = $row['value_number'] === null ? null : (float) $row['value_number'];
                    $display = $value === null ? '' : self::formatNumber((string) $row['value_number']) . ($unit ? ' ' . $unit : '');
                    break;
                case 'boolean':
                    $value   = $row['value_text'] === '1';
                    $display = $value ? 'Yes' : 'No';
                    break;
                case 'multiselect':
                    $decoded = json_decode((string) $row['value_text'], true);
                    $value   = is_array($decoded) ? $decoded : [];
                    $display = implode(', ', $value);
                    break;
                default:
                    $value   = $row['value_text'];
                    $display = (string) $value;
            }
            $out[] = [
                'field_key' => $field['field_key'],
                'label'     => $field['label'],
                'data_type' => $field['data_type'],
                'unit'      => $unit,
                'value'     => $value,
                'display'   => $display,
            ];
        }
        return $out;
    }

    /** "25.500" -> "25.5", "1200.000" -> "1,200" */
    private static function formatNumber(string $decimal): string
    {
        $parts = explode('.', $decimal);
        $whole = number_format((float) $parts[0]);
        if (strpos($parts[0], '-') === 0 && $whole[0] !== '-') {
            $whole = '-' . $whole;
        }
        $fraction = rtrim($parts[1] ?? '', '0');
        return $fraction === '' ? $whole : $whole . '.' . $fraction;
    }

    /** @return string[] */
    private static function options(array $field): array
    {
        $options = json_decode((string) $field['options'], true);
        return is_array($options) ? $options : [];
    }

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
