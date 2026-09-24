-- 019_create_equipment_types.sql
-- ERD entity: EQUIPMENT_TYPE
-- ERD relationship: EQUIPMENT_CATEGORY ||--|{ EQUIPMENT_TYPE "contains"
--
-- Second level of the catalogue: the specific kind of machine or item
-- (Excavator, Paddy Harvester, LED Screen, ...). A listing picks exactly one
-- type, and the type decides which spec fields the listing has
-- (equipment_spec_fields).
--
--   is_other    1 = the catch-all "Other ..." type of its category. It has no
--               spec fields; listings under it describe themselves in
--               equipment.extra_specs instead.
--   is_active   0 = hidden from customers and from the listing form, kept
--               because existing listings still point at it.
--
-- category_id is ON DELETE RESTRICT: a category that still has types can't be
-- deleted, only deactivated.

CREATE TABLE equipment_types (
    type_id     BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    category_id BIGINT UNSIGNED   NOT NULL,
    slug        VARCHAR(80)       NOT NULL,
    name        VARCHAR(80)       NOT NULL,
    is_other    TINYINT(1)        NOT NULL DEFAULT 0,
    sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_active   TINYINT(1)        NOT NULL DEFAULT 1,
    created_at  TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_equipment_types PRIMARY KEY (type_id),
    CONSTRAINT uq_equipment_types_slug UNIQUE (slug),
    CONSTRAINT uq_equipment_types_category_name UNIQUE (category_id, name),
    CONSTRAINT fk_equipment_types_category_id FOREIGN KEY (category_id)
        REFERENCES equipment_categories (category_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_equipment_types_is_other CHECK (is_other IN (0, 1)),
    CONSTRAINT chk_equipment_types_is_active CHECK (is_active IN (0, 1)),

    INDEX idx_equipment_types_category_id (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
