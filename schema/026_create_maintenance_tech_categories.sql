-- 026_create_maintenance_tech_categories.sql
-- ERD entity: MAINTENANCE_TECH_CATEGORY (associative)
-- ERD relationship: MAINTENANCE_TECH }o--o{ EQUIPMENT_CATEGORY "services"
--
-- Which equipment categories a maintenance technician can service, picked
-- from the catalogue instead of typed as free text, so maintenance work can
-- later be matched to a technician by the equipment's category.
--
-- maintenance_techs.specialization is kept: it still holds the category names
-- as display text (written by MaintenanceTechController on registration), and
-- rows registered before this migration only have that text.

CREATE TABLE maintenance_tech_categories (
    user_id     BIGINT UNSIGNED NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,

    CONSTRAINT pk_maintenance_tech_categories PRIMARY KEY (user_id, category_id),
    CONSTRAINT fk_maintenance_tech_categories_user_id FOREIGN KEY (user_id)
        REFERENCES maintenance_techs (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_maintenance_tech_categories_category_id FOREIGN KEY (category_id)
        REFERENCES equipment_categories (category_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_maintenance_tech_categories_category_id (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
