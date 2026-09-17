-- 009_create_delivery_personnel.sql
-- ERD entity: DELIVERY_PERSONNEL (subtype of USER, 1:0..1)
-- ERD relationship: AREA_MANAGER ||--o{ DELIVERY_PERSONNEL "registers"
--
-- NOTE: the ERD's area_id FK is intentionally omitted. There is no areas
-- table yet; a later migration will add the areas table, this column and its
-- foreign key together.

CREATE TABLE delivery_personnel (
    user_id             BIGINT UNSIGNED NOT NULL,
    registered_by       BIGINT UNSIGNED NOT NULL,
    driving_license_no  VARCHAR(20)     NOT NULL,
    license_class       VARCHAR(20)     NOT NULL,
    license_expiry      DATE            NOT NULL,
    availability_status ENUM(
                            'available',
                            'busy',
                            'unavailable'
                        )               NOT NULL DEFAULT 'available',

    CONSTRAINT pk_delivery_personnel PRIMARY KEY (user_id),
    CONSTRAINT uq_delivery_personnel_driving_license_no UNIQUE (driving_license_no),
    CONSTRAINT fk_delivery_personnel_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_delivery_personnel_registered_by FOREIGN KEY (registered_by)
        REFERENCES area_managers (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_delivery_personnel_registered_by (registered_by),
    INDEX idx_delivery_personnel_availability_status (availability_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
