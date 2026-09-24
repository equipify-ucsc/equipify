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
     * A real calendar date written as YYYY-MM-DD (the format <input type="date">
     * submits and MySQL DATE stores).
     *
     * @param mixed $value
     */
    public static function date($value, string $label): ?string
    {
        if ($m = self::required($value, $label)) {
            return $m;
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', trim($value));
        // createFromFormat accepts overflow like 2026-02-31 and rolls it over,
        // so compare the reformatted date back to the input.
        if ($date === false || $date->format('Y-m-d') !== trim($value)) {
            return $label . ' must be a valid date.';
        }
        return null;
    }

    /** A valid date that is today or later. @param mixed $value */
    public static function futureDate($value, string $label): ?string
    {
        if ($m = self::date($value, $label)) {
            return $m;
        }
        $today = new DateTimeImmutable('today');
        if (DateTimeImmutable::createFromFormat('!Y-m-d', trim($value)) < $today) {
            return $label . ' cannot be in the past.';
        }
        return null;
    }

    /**
     * A Sri Lankan NIC: the old 9 digits + V/X, or the new 12 digits. Use
     * normalizeNic() to get the stored (uppercased) form.
     *
     * @param mixed $value
     */
    public static function nic($value): ?string
    {
        if ($m = self::required($value, 'NIC number')) {
            return $m;
        }
        if (self::normalizeNic($value) === null) {
            return 'Enter a valid NIC number (9 digits with V/X, or 12 digits).';
        }
        return null;
    }

    /** Returns the uppercased NIC, or null if it isn't a valid Sri Lankan NIC. */
    public static function normalizeNic(string $value): ?string
    {
        $nic = strtoupper(preg_replace('/\s+/', '', $value));
        if (preg_match('/^(?:\d{9}[VX]|\d{12})$/', (string) $nic) !== 1) {
            return null;
        }
        return $nic;
    }

    /**
     * A whole number within a range. An empty value passes: use required()
     * alongside it when the field is mandatory.
     *
     * @param mixed $value
     */
    public static function intRange($value, int $min, int $max, string $label): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (filter_var($value, FILTER_VALIDATE_INT) === false) {
            return $label . ' must be a whole number.';
        }
        $number = (int) $value;
        if ($number < $min || $number > $max) {
            return $label . ' must be between ' . $min . ' and ' . $max . '.';
        }
        return null;
    }

    /**
     * A decimal number within a range, with at most $decimals places (so it
     * fits a DECIMAL(n,$decimals) column without rounding). An empty value
     * passes: use required() alongside it when the field is mandatory.
     *
     * @param mixed $value
     */
    public static function decimalRange($value, float $min, float $max, int $decimals, string $label): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_numeric($value)) {
            return $label . ' must be a number.';
        }
        $number = (float) $value;
        if ($number < $min || $number > $max) {
            return $label . ' must be between ' . $min . ' and ' . $max . '.';
        }
        // Plain digits only: is_numeric() also accepts "1e1" and " 5".
        $pattern = $decimals > 0 ? '/^\d+(?:\.\d{1,' . $decimals . '})?$/' : '/^\d+$/';
        if (preg_match($pattern, (string) $value) !== 1) {
            return $label . ' can have at most ' . $decimals . ' decimal places.';
        }
        return null;
    }

    /**
     * A money amount that fits DECIMAL(10,2) and is not negative. An empty
     * value passes: use required() alongside it when the amount is mandatory.
     *
     * @param mixed $value
     */
    public static function money($value, string $label): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_numeric($value)) {
            return $label . ' must be an amount.';
        }
        $amount = (float) $value;
        if ($amount < 0) {
            return $label . ' cannot be negative.';
        }
        // DECIMAL(10,2): at most 8 digits before the decimal point.
        if ($amount > 99999999.99) {
            return $label . ' is too large.';
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
