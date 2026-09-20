<?php
/**
 * Reusable input checks. Each method returns an error message, or null when the
 * value is fine, so a controller can collect messages per field:
 *
 *     $errors = [];
 *     if ($m = Validator::email($in['email'] ?? null)) $errors['email'] = $m;
 */

declare(strict_types=1);

final class Validator
{
    /** @param mixed $value */
    public static function required($value, string $label): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return $label . ' is required.';
        }
        return null;
    }

    /** @param mixed $value */
    public static function maxLength($value, int $max, string $label): ?string
    {
        if (is_string($value) && mb_strlen(trim($value)) > $max) {
            return $label . ' must be at most ' . $max . ' characters.';
        }
        return null;
    }

    /** @param mixed $value */
    public static function email($value): ?string
    {
        if ($m = self::required($value, 'Email')) {
            return $m;
        }
        $value = trim($value);
        if (mb_strlen($value) > 255 || filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            return 'Enter a valid email address.';
        }
        return null;
    }

    /**
     * Sri Lankan numbers: +94771234567, 94771234567, 0771234567 (spaces/dashes
     * allowed). Use normalizePhone() to get the stored form.
     *
     * @param mixed $value
     */
    public static function phone($value): ?string
    {
        if ($m = self::required($value, 'Phone number')) {
            return $m;
        }
        if (self::normalizePhone($value) === null) {
            return 'Enter a valid Sri Lankan phone number.';
        }
        return null;
    }

    /** Returns +94XXXXXXXXX, or null if the input isn't a valid Sri Lankan number. */
    public static function normalizePhone(string $value): ?string
    {
        $digits = preg_replace('/[\s\-().]/', '', $value);
        if (preg_match('/^(?:\+94|94|0)?([1-9]\d{8})$/', (string) $digits, $m) !== 1) {
            return null;
        }
        return '+94' . $m[1];
    }

    /** At least 8 characters with a letter and a digit. @param mixed $value */
    public static function password($value): ?string
    {
        if (!is_string($value) || $value === '') {
            return 'Password is required.';
        }
        if (strlen($value) < 8 || preg_match('/[A-Za-z]/', $value) !== 1 || preg_match('/\d/', $value) !== 1) {
            return 'Password must be at least 8 characters and include a letter and a number.';
        }
        // bcrypt ignores everything after 72 bytes, so refuse rather than silently truncate.
        if (strlen($value) > 72) {
            return 'Password must be at most 72 characters.';
        }
        return null;
    }

    /**
     * @param mixed    $value
     * @param string[] $allowed
     */
    public static function oneOf($value, array $allowed, string $label): ?string
    {
        if (!is_string($value) || !in_array($value, $allowed, true)) {
            return 'Select a valid ' . $label . '.';
        }
        return null;
    }
}
