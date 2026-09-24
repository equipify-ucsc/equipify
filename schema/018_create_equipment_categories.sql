-- 018_create_equipment_categories.sql
-- ERD entity: EQUIPMENT_CATEGORY
--
-- Top level of the equipment catalogue: a small, stable set of broad families
-- (Earthmoving & Road Works, Agriculture, Events & AV, ...). Customers pick a
-- category first when filtering, so this list is kept short (about 10) on
-- purpose; the catalogue grows by adding equipment_types, not categories.
--
--   slug        stable machine name, used by the seed data.
--   icon        Material Symbols ligature shown on the category tiles.
--   is_active   0 = hidden from customers and from the listing form. A
--               category is deactivated rather than deleted, because its
--               types and listings must keep pointing at it.

CREATE TABLE equipment_categories (
    category_id BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    slug        VARCHAR(60)       NOT NULL,
    name        VARCHAR(80)       NOT NULL,
    icon        VARCHAR(40)       NOT NULL DEFAULT 'category',
    sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_active   TINYINT(1)        NOT NULL DEFAULT 1,
    created_at  TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_equipment_categories PRIMARY KEY (category_id),
    CONSTRAINT uq_equipment_categories_slug UNIQUE (slug),
    CONSTRAINT uq_equipment_categories_name UNIQUE (name),
    CONSTRAINT chk_equipment_categories_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
