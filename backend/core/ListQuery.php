<?php
/**
 * Query-string handling for paged list endpoints, plus the one response shape
 * they all use:
 *
 *     {"items": [...], "page": 1, "per_page": 10, "total": 37, "total_pages": 4}
 *
 * Reading `$_GET` is a controller job (models never see the request), so this
 * is a controller-side helper: it clamps `page`/`per_page` rather than erroring
 * on junk, and drops filter values that aren't in the column's enum instead of
 * letting them reach SQL.
 */

declare(strict_types=1);

final class ListQuery
{
    public const DEFAULT_PER_PAGE = 10;
    public const MAX_PER_PAGE     = 50;

    /** Page number, clamped to 1 or more. Junk ('abc', '0', '-1') reads as page 1. */
    public static function page(): int
    {
        $page = filter_var($_GET['page'] ?? null, FILTER_VALIDATE_INT);
        return ($page === false || $page < 1) ? 1 : $page;
    }

    /** Page size, clamped to 1..MAX_PER_PAGE so a caller can't ask for everything. */
    public static function perPage(int $default = self::DEFAULT_PER_PAGE): int
    {
        $perPage = filter_var($_GET['per_page'] ?? null, FILTER_VALIDATE_INT);
        if ($perPage === false || $perPage < 1) {
            return $default;
        }
        return min($perPage, self::MAX_PER_PAGE);
    }

    /** A trimmed free-text search term, or '' when absent. */
    public static function search(string $key = 'q'): string
    {
        $value = $_GET[$key] ?? '';
        return is_string($value) ? trim($value) : '';
    }

    /**
     * A filter value, but only when it is one the column accepts. An unknown
     * value is treated as "no filter", so a stale bookmark shows everything
     * rather than an error page.
     *
     * @param string[] $allowed
     */
    public static function enum(string $key, array $allowed): string
    {
        $value = $_GET[$key] ?? '';
        return (is_string($value) && in_array($value, $allowed, true)) ? $value : '';
    }

    /** A YYYY-MM-DD bound for a date range filter, or '' when absent or malformed. */
    public static function date(string $key): string
    {
        $value = $_GET[$key] ?? '';
        if (!is_string($value) || $value === '') {
            return '';
        }
        return Validator::date($value, 'Date') === null ? $value : '';
    }

    /** A checkbox-style flag: '1', 'true' and 'yes' are on, everything else off. */
    public static function flag(string $key): bool
    {
        $value = $_GET[$key] ?? '';
        return is_string($value) && in_array(strtolower($value), ['1', 'true', 'yes'], true);
    }

    /**
     * Wraps one page of rows with the counts the pager needs.
     *
     * @param array<int,mixed> $items rows for this page only
     * @return array<string,mixed>
     */
    public static function envelope(array $items, int $page, int $perPage, int $total): array
    {
        return [
            'items'       => array_values($items),
            'page'        => $page,
            'per_page'    => $perPage,
            'total'       => $total,
            'total_pages' => $total === 0 ? 0 : (int) ceil($total / $perPage),
        ];
    }

    /**
     * Search -> filter -> slice over an in-memory array, for the endpoints whose
     * tables don't exist yet. Same semantics the SQL versions will implement, so
     * the pages don't change when those tables land.
     *
     * @param array<int,array<string,mixed>> $rows
     * @param callable|null                  $matches fn(array $row): bool
     * @return array<string,mixed> the envelope
     */
    public static function paginate(array $rows, int $page, int $perPage, ?callable $matches = null): array
    {
        if ($matches !== null) {
            $rows = array_values(array_filter($rows, $matches));
        }
        $total = count($rows);
        return self::envelope(array_slice($rows, ($page - 1) * $perPage, $perPage), $page, $perPage, $total);
    }

    /** Case-insensitive "does any of these fields contain the search term". */
    public static function contains(string $term, string ...$fields): bool
    {
        if ($term === '') {
            return true;
        }
        $needle = mb_strtolower($term);
        foreach ($fields as $field) {
            if (mb_strpos(mb_strtolower($field), $needle) !== false) {
                return true;
            }
        }
        return false;
    }
}
