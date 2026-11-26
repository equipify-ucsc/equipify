-- 038_create_inspection_media.sql
-- ERD entity: INSPECTION_MEDIA
-- ERD relationship: INSPECTION ||--o{ INSPECTION_MEDIA "is documented by"
--
-- The photos attached to an inspection. Same pattern as equipment_photos:
-- file_path is relative to backend/storage (e.g. uploads/<32 hex>.jpg),
-- written by core/Upload.php and served only through a controller that checks
-- who is asking (the parties to the rental and admins). Whether a photo is
-- "before" or "after" is decided by its inspection's inspection_type, so the
-- Damage Mediation page can show the two sets side by side.
--
--   caption  optional label, e.g. "Left track, scratch".
--
-- Photos belong to their inspection (ON DELETE CASCADE). The inspection itself
-- is protected from deletion by its RESTRICT link to the rental.

CREATE TABLE inspection_media (
    media_id      BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    inspection_id BIGINT UNSIGNED   NOT NULL,
    file_path     VARCHAR(500)      NOT NULL,
    caption       VARCHAR(255)      NULL DEFAULT NULL,
    sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_inspection_media PRIMARY KEY (media_id),
    CONSTRAINT fk_inspection_media_inspection_id FOREIGN KEY (inspection_id)
        REFERENCES inspections (inspection_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_inspection_media_inspection_id (inspection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
