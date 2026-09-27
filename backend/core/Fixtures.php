<?php
/**
 * Reads the placeholder rows in backend/fixtures/*.json.
 *
 * Several screens are finished before the tables behind them exist. Rather
 * than hardcode their rows in the browser, the rows live here and are served
 * through the normal API, so the pages are written against real endpoints and
 * only the controller bodies change when the tables land.
 *
 *     $rows = Fixtures::forRole('notifications', Auth::role());
 *
 * Timestamps are stored as offsets, not dates, so the demo data never goes
 * stale: a notification written "90 minutes ago" is still 90 minutes old next
 * month. Fixtures::at() turns an offset into the format the page expects.
 */

declare(strict_types=1);

final class Fixtures
{
    private const DIR = __DIR__ . '/../fixtures/';

    /**
     * The whole file, decoded. Read once per request.
     *
     * @return array<string,mixed>
     */
    public static function load(string $name): array
    {
        static $cache = [];
        if (isset($cache[$name])) {
            return $cache[$name];
        }

        // The name comes from our own code, never from a request, but the
        // check keeps it that way if someone wires it to one by mistake.
        if (preg_match('/^[a-z0-9-]+$/', $name) !== 1) {
            throw new RuntimeException('Bad fixture name: ' . $name);
        }

        $path = self::DIR . $name . '.json';
        $raw  = is_file($path) ? file_get_contents($path) : false;
        if ($raw === false) {
            throw new RuntimeException('Missing fixture file: ' . $name . '.json');
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            // Loudly, because a stray comma would otherwise render as an
            // empty page and look like a missing-data bug.
            throw new RuntimeException(
                'Invalid JSON in ' . $name . '.json: ' . json_last_error_msg()
            );
        }

        return $cache[$name] = $data;
    }

    /**
     * The slice of a role-keyed fixture belonging to one role, or [] when that
     * role has none.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function forRole(string $name, ?string $role): array
    {
        $rows = self::load($name)[$role ?? ''] ?? [];
        return is_array($rows) ? $rows : [];
    }

    /** A timestamp $minutes ago, as "YYYY-MM-DD HH:MM:SS" (what the inbox pages parse). */
    public static function at(int $minutesAgo): string
    {
        return date('Y-m-d H:i:s', time() - ($minutesAgo * 60));
    }

    /** A timestamp $days ago in ISO 8601 (what the complaints page parses). */
    public static function iso(int $daysAgo): string
    {
        return date('c', time() - ($daysAgo * 86400));
    }

    /** A plain date $days from today, negative for the past. */
    public static function day(int $daysFromNow): string
    {
        return date('Y-m-d', time() + ($daysFromNow * 86400));
    }
}
