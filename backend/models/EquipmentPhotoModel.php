<?php
/**
 * SQL for `equipment_photos`. file_path is relative to backend/storage and
 * never leaves the server; pages get the photo endpoint URL instead.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class EquipmentPhotoModel
{
    /** @return array<int,array<string,mixed>> cover first, then upload order */
    public static function forEquipment(int $equipmentId): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT photo_id, equipment_id, file_path, is_cover, sort_order
               FROM equipment_photos WHERE equipment_id = :id
              ORDER BY is_cover DESC, sort_order, photo_id'
        );
        $stmt->execute([':id' => $equipmentId]);
        return $stmt->fetchAll();
    }

    /** @return array<string,mixed>|null the photo, only if it belongs to that listing */
    public static function find(int $photoId, int $equipmentId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT photo_id, equipment_id, file_path, is_cover
               FROM equipment_photos WHERE photo_id = :id AND equipment_id = :equipment_id'
        );
        $stmt->execute([':id' => $photoId, ':equipment_id' => $equipmentId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public static function countFor(int $equipmentId): int
    {
        $stmt = getDbConnection()->prepare('SELECT COUNT(*) FROM equipment_photos WHERE equipment_id = :id');
        $stmt->execute([':id' => $equipmentId]);
        return (int) $stmt->fetchColumn();
    }

    /** Adds a photo at the end; the listing's first photo becomes its cover. @return int photo_id */
    public static function insert(int $equipmentId, string $filePath): int
    {
        $db   = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO equipment_photos (equipment_id, file_path, is_cover, sort_order)
             SELECT :equipment_id, :file_path,
                    NOT EXISTS (SELECT 1 FROM equipment_photos WHERE equipment_id = :equipment_id2),
                    COALESCE((SELECT MAX(sort_order) FROM equipment_photos WHERE equipment_id = :equipment_id3), 0) + 10'
        );
        $stmt->execute([
            ':equipment_id'  => $equipmentId,
            ':equipment_id2' => $equipmentId,
            ':equipment_id3' => $equipmentId,
            ':file_path'     => $filePath,
        ]);
        return (int) $db->lastInsertId();
    }

    /** Makes one photo the listing's only cover. */
    public static function setCover(int $photoId, int $equipmentId): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE equipment_photos SET is_cover = (photo_id = :id)
              WHERE equipment_id = :equipment_id'
        );
        $stmt->execute([':id' => $photoId, ':equipment_id' => $equipmentId]);
    }

    public static function delete(int $photoId, int $equipmentId): void
    {
        $stmt = getDbConnection()->prepare(
            'DELETE FROM equipment_photos WHERE photo_id = :id AND equipment_id = :equipment_id'
        );
        $stmt->execute([':id' => $photoId, ':equipment_id' => $equipmentId]);
    }

    /** Every stored file of a listing, so they can be removed from disk after it is deleted. @return string[] */
    public static function pathsFor(int $equipmentId): array
    {
        $stmt = getDbConnection()->prepare('SELECT file_path FROM equipment_photos WHERE equipment_id = :id');
        $stmt->execute([':id' => $equipmentId]);
        return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
}
