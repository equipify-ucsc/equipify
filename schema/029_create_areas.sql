-- Area catalogue. Keep this table independent of districts: areas are the
-- operational regions assigned by Admin Ops and need not map 1:1 to districts.

CREATE TABLE areas (
    area_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name         VARCHAR(100)    NOT NULL,
    description  TEXT            NULL DEFAULT NULL,
    is_active    TINYINT(1)      NOT NULL DEFAULT 1,
    created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_areas PRIMARY KEY (area_id),
    CONSTRAINT uq_areas_name UNIQUE (name),
    CONSTRAINT chk_areas_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
