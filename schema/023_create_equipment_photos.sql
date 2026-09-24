-- 023_create_equipment_photos.sql
-- ERD entity: EQUIPMENT_PHOTO
-- ERD relationship: EQUIPMENT ||--o{ EQUIPMENT_PHOTO "shows"
--
-- file_path is relative to backend/storage (e.g. uploads/<32 hex>.jpg), written
-- by core/Upload.php. storage/.htaccess denies direct access, so photos are
-- served only through EquipmentBrowseController::photo().
--
--   is_cover  the photo shown on listing cards; one per listing is a PHP-side
--             rule (EquipmentPhotoModel::setCover).

CREATE TABLE equipment_photos (
    photo_id     BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    equipment_id BIGINT UNSIGNED   NOT NULL,
    file_path    VARCHAR(500)      NOT NULL,
    is_cover     TINYINT(1)        NOT NULL DEFAULT 0,
    sort_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at   TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_equipment_photos PRIMARY KEY (photo_id),
    CONSTRAINT fk_equipment_photos_equipment_id FOREIGN KEY (equipment_id)
        REFERENCES equipment (equipment_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_equipment_photos_is_cover CHECK (is_cover IN (0, 1)),

    INDEX idx_equipment_photos_equipment_id (equipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
