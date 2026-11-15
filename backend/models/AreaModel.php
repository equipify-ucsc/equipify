<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/db_config.php';

final class AreaModel
{
    public static function all(): array
    {
        return getDbConnection()->query('SELECT area_id, name, description, is_active, created_at, updated_at
            FROM areas ORDER BY name, area_id')->fetchAll();
    }

    public static function find(int $id): ?array
    {
        $stmt = getDbConnection()->prepare('SELECT area_id, name, description, is_active, created_at, updated_at
            FROM areas WHERE area_id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function nameExists(string $name, int $exceptId = 0): bool
    {
        $stmt = getDbConnection()->prepare('SELECT 1 FROM areas WHERE name = ? AND area_id <> ? LIMIT 1');
        $stmt->execute([$name, $exceptId]);
        return $stmt->fetchColumn() !== false;
    }

    public static function insert(string $name, ?string $description): int
    {
        $db = getDbConnection();
        $stmt = $db->prepare('INSERT INTO areas (name, description) VALUES (?, ?)');
        $stmt->execute([$name, $description]);
        return (int) $db->lastInsertId();
    }

    public static function update(int $id, string $name, ?string $description): void
    {
        $stmt = getDbConnection()->prepare('UPDATE areas SET name = ?, description = ? WHERE area_id = ?');
        $stmt->execute([$name, $description, $id]);
    }

    public static function setActive(int $id, bool $active): void
    {
        $stmt = getDbConnection()->prepare('UPDATE areas SET is_active = ? WHERE area_id = ? AND is_active <> ?');
        $stmt->execute([(int) $active, $id, (int) $active]);
    }
}
