-- 020_create_equipment_spec_fields.sql
-- ERD entity: EQUIPMENT_SPEC_FIELD
-- ERD relationship: EQUIPMENT_TYPE ||--o{ EQUIPMENT_SPEC_FIELD "defines"
--
-- The technical attributes a listing of a given type must or may state, e.g.
-- Diesel Generator -> power output (kVA), phase, silent canopy. Each type owns
-- its own rows, but types reuse the same field_key for the same idea
-- (power_source, operating_weight_t, ...) so filters behave the same everywhere.
--
--   data_type      number       value stored in equipment_spec_values.value_number
--                  text         free text, value_text
--                  boolean      '1' / '0' in value_text
--                  select       one of options, value_text
--                  multiselect  a JSON array of options, value_text
--   options        JSON array of allowed values; required for select and
--                  multiselect, NULL otherwise.
--   is_filterable  1 = offered as a Browsing-page filter once the customer has
--                  picked this type.
--
-- Rules the PHP layer enforces (CatalogueService), not the schema: at most 3
-- filterable fields per type, options present and a valid JSON array exactly
-- when data_type is select or multiselect, and field_key matching
-- ^[a-z][a-z0-9_]{1,49}$.

CREATE TABLE equipment_spec_fields (
    spec_field_id BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    type_id       BIGINT UNSIGNED   NOT NULL,
    field_key     VARCHAR(50)       NOT NULL,
    label         VARCHAR(80)       NOT NULL,
    data_type     ENUM(
                      'number',
                      'text',
                      'boolean',
                      'select',
                      'multiselect'
                  )                 NOT NULL,
    unit          VARCHAR(20)       NULL DEFAULT NULL,
    options       VARCHAR(1000)     NULL DEFAULT NULL,
    is_required   TINYINT(1)        NOT NULL DEFAULT 0,
    is_filterable TINYINT(1)        NOT NULL DEFAULT 0,
    sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_equipment_spec_fields PRIMARY KEY (spec_field_id),
    CONSTRAINT uq_equipment_spec_fields_type_key UNIQUE (type_id, field_key),
    CONSTRAINT fk_equipment_spec_fields_type_id FOREIGN KEY (type_id)
        REFERENCES equipment_types (type_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_equipment_spec_fields_is_required CHECK (is_required IN (0, 1)),
    CONSTRAINT chk_equipment_spec_fields_is_filterable CHECK (is_filterable IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
