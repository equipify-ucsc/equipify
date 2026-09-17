-- 007_create_area_managers.sql
-- ERD entity: AREA_MANAGER (subtype of USER, 1:0..1)
-- ERD relationship: ADMIN ||--o{ AREA_MANAGER "registers"
-- registered_by is RESTRICT: an admin who registered area managers cannot be
-- hard-deleted. Disable the account via users.account_status instead.

CREATE TABLE area_managers (
    user_id         BIGINT UNSIGNED NOT NULL,
    registered_by   BIGINT UNSIGNED NOT NULL,

    CONSTRAINT pk_area_managers PRIMARY KEY (user_id),
    CONSTRAINT fk_area_managers_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_area_managers_registered_by FOREIGN KEY (registered_by)
        REFERENCES admins (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_area_managers_registered_by (registered_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
