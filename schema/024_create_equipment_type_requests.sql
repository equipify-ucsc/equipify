-- 024_create_equipment_type_requests.sql
-- ERD entity: EQUIPMENT_TYPE_REQUEST
-- ERD relationships: RENTING_PARTY ||--o{ EQUIPMENT_TYPE_REQUEST "suggests"
--                    EQUIPMENT_CATEGORY ||--o{ EQUIPMENT_TYPE_REQUEST "in"
--                    ADMIN |o--o{ EQUIPMENT_TYPE_REQUEST "reviews"
--
-- A renting party asks for a type the catalogue doesn't have yet. Until an
-- admin approves it (creating the type) the item can be listed under the
-- category's "Other ..." type.
--
--   status            pending -> approved (resolved_type_id set) or rejected.
--   resolved_type_id  the type created on approval; SET NULL if that type is
--                     ever removed, so the request history survives.

CREATE TABLE equipment_type_requests (
    request_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    requested_by     BIGINT UNSIGNED NOT NULL,
    category_id      BIGINT UNSIGNED NOT NULL,
    proposed_name    VARCHAR(80)     NOT NULL,
    reason           VARCHAR(500)    NULL DEFAULT NULL,
    status           ENUM(
                         'pending',
                         'approved',
                         'rejected'
                     )               NOT NULL DEFAULT 'pending',
    resolved_type_id BIGINT UNSIGNED NULL DEFAULT NULL,
    reviewed_by      BIGINT UNSIGNED NULL DEFAULT NULL,
    admin_note       VARCHAR(500)    NULL DEFAULT NULL,
    reviewed_at      TIMESTAMP       NULL DEFAULT NULL,
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_equipment_type_requests PRIMARY KEY (request_id),
    CONSTRAINT fk_equipment_type_requests_requested_by FOREIGN KEY (requested_by)
        REFERENCES renting_parties (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_equipment_type_requests_category_id FOREIGN KEY (category_id)
        REFERENCES equipment_categories (category_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_equipment_type_requests_resolved_type_id FOREIGN KEY (resolved_type_id)
        REFERENCES equipment_types (type_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_equipment_type_requests_reviewed_by FOREIGN KEY (reviewed_by)
        REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_equipment_type_requests_requested_by (requested_by),
    INDEX idx_equipment_type_requests_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
