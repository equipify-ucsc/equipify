-- 001_create_users.sql
-- ERD entity: USER
-- Base account row shared by every role. Role-specific data lives in the
-- subtype tables (customers, renting_parties, freelance_workers,
-- maintenance_techs, delivery_personnel, area_managers, admins), each keyed
-- 1:0..1 on user_id.
--
-- status_changed_by references admins(user_id), but admins itself references
-- users, so that foreign key is added later in
-- 003_add_users_status_changed_by_fk.sql.

CREATE TABLE users (
    user_id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email               VARCHAR(255)    NOT NULL,
    password_hash       VARCHAR(255)    NOT NULL,
    role                ENUM(
                            'customer',
                            'renting_party',
                            'freelance_worker',
                            'maintenance_tech',
                            'delivery_personnel',
                            'area_manager',
                            'admin'
                        )               NOT NULL,
    full_name           VARCHAR(150)    NOT NULL,
    phone               VARCHAR(20)     NOT NULL,
    nic_number          VARCHAR(12)     NULL DEFAULT NULL,
    profile_photo_url   VARCHAR(500)    NULL DEFAULT NULL,
    address_line        VARCHAR(255)    NULL DEFAULT NULL,
    district            VARCHAR(50)     NULL DEFAULT NULL,
    account_status      ENUM(
                            'active',
                            'suspended',
                            'banned',
                            'deactivated'
                        )               NOT NULL DEFAULT 'active',
    status_reason       VARCHAR(255)    NULL DEFAULT NULL,
    status_changed_by   BIGINT UNSIGNED NULL DEFAULT NULL,
    status_changed_at   TIMESTAMP       NULL DEFAULT NULL,
    email_verified_at   TIMESTAMP       NULL DEFAULT NULL,
    last_login_at       TIMESTAMP       NULL DEFAULT NULL,
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_users PRIMARY KEY (user_id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_phone UNIQUE (phone),
    CONSTRAINT uq_users_nic_number UNIQUE (nic_number),

    INDEX idx_users_role (role),
    INDEX idx_users_account_status (account_status),
    INDEX idx_users_status_changed_by (status_changed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
