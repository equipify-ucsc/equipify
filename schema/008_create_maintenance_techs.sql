-- 008_create_maintenance_techs.sql
-- ERD entity: MAINTENANCE_TECH (subtype of USER, 1:0..1)
-- ERD relationship: AREA_MANAGER ||--o{ MAINTENANCE_TECH "registers"

CREATE TABLE maintenance_techs (
    user_id             BIGINT UNSIGNED NOT NULL,
    registered_by       BIGINT UNSIGNED NOT NULL,
    bio                 TEXT            NULL,
    years_experience    INT UNSIGNED    NULL DEFAULT NULL,
    specialization      VARCHAR(150)    NULL DEFAULT NULL,
    availability_status ENUM(
                            'available',
                            'busy',
                            'unavailable'
                        )               NOT NULL DEFAULT 'available',

    CONSTRAINT pk_maintenance_techs PRIMARY KEY (user_id),
    CONSTRAINT fk_maintenance_techs_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_maintenance_techs_registered_by FOREIGN KEY (registered_by)
        REFERENCES area_managers (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_maintenance_techs_registered_by (registered_by),
    INDEX idx_maintenance_techs_availability_status (availability_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
