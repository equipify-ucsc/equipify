-- 034_create_maintenance_request_photos.sql
-- ERD entity: MAINTENANCE_REQUEST_PHOTO
-- ERD relationship: MAINTENANCE_REQUEST ||--o{ MAINTENANCE_REQUEST_PHOTO "shows"
--
-- Photos of the problem, attached by the renting party when it submits a
-- maintenance request. Same pattern as equipment_photos: file_path is relative
-- to backend/storage (e.g. uploads/<32 hex>.jpg), written by core/Upload.php;
-- storage/.htaccess denies direct access, so the files are served only
-- through a controller that checks who is asking (the owner, the assigned
-- technician, or an area manager).
--
-- The photos belong to the request, so they are removed with it.

CREATE TABLE maintenance_request_photos (
    photo_id               BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    request_id             BIGINT UNSIGNED   NOT NULL,
    file_path              VARCHAR(500)      NOT NULL,
    sort_order             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at             TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_maintenance_request_photos PRIMARY KEY (photo_id),
    CONSTRAINT fk_maintenance_request_photos_request_id FOREIGN KEY (request_id)
        REFERENCES maintenance_requests (request_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_maintenance_request_photos_request_id (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
