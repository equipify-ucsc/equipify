-- 002_create_admins.sql
-- ERD entity: ADMIN (subtype of USER, 1:0..1)

CREATE TABLE admins (
    user_id BIGINT UNSIGNED NOT NULL,

    CONSTRAINT pk_admins PRIMARY KEY (user_id),
    CONSTRAINT fk_admins_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
