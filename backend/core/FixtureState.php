<?php
/**
 * Per-session changes laid over the read-only rows in backend/fixtures/.
 *
 * The fixtures are files, so a write cannot change them. Without somewhere to
 * put the change, "Mark all read" would appear to work and then undo itself on
 * the next page load, which reads as a bug rather than as placeholder data.
 * This keeps those changes in $_SESSION: they survive navigation and reload,
 * and disappear at logout.
 *
 *     FixtureState::put('notifications.read', 'dn-3', true);
 *     $read = FixtureState::bucket('notifications.read');
 *
 * Scoped by user id, so signing in as someone else does not inherit the last
 * person's read marks. When the real tables arrive this whole class goes with
 * them.
 */

declare(strict_types=1);

final class FixtureState
{
    private const ROOT = 'fixture_state';

    /**
     * Everything stored under one bucket, or [] when nothing is.
     *
     * @return array<string,mixed>
     */
    public static function bucket(string $bucket): array
    {
        $all = $_SESSION[self::ROOT][self::owner()][$bucket] ?? [];
        return is_array($all) ? $all : [];
    }

    /** @param mixed $value */
    public static function put(string $bucket, string $key, $value): void
    {
        $_SESSION[self::ROOT][self::owner()][$bucket][$key] = $value;
    }

    /** Appends to a list-shaped bucket (sent messages, submitted complaints). */
    public static function push(string $bucket, array $row): void
    {
        $_SESSION[self::ROOT][self::owner()][$bucket][] = $row;
    }

    /** A list-shaped bucket, in insertion order. @return array<int,array<string,mixed>> */
    public static function rows(string $bucket): array
    {
        return array_values(self::bucket($bucket));
    }

    /** The session user, or 'anon' — the role gate means that should never be hit. */
    private static function owner(): string
    {
        return (string) (Auth::userId() ?? 'anon');
    }
}
