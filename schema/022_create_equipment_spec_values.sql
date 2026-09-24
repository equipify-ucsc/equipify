-- 022_create_equipment_spec_values.sql
-- ERD entity: EQUIPMENT_SPEC_VALUE
-- ERD relationships: EQUIPMENT ||--o{ EQUIPMENT_SPEC_VALUE "states"
--                    EQUIPMENT_SPEC_FIELD ||--o{ EQUIPMENT_SPEC_VALUE "answers"
--
-- One listing's value for one spec field. A number field fills value_number
-- (so the Browsing page can filter by min/max); every other data type fills
-- value_text. Which column is used is decided by the field's data_type in PHP.
--
-- spec_field_id is ON DELETE RESTRICT: CatalogueService refuses to remove a
-- spec field that listings have already answered.

CREATE TABLE equipment_spec_values (
    equipment_id  BIGINT UNSIGNED NOT NULL,
    spec_field_id BIGINT UNSIGNED NOT NULL,
    value_text    VARCHAR(255)    NULL DEFAULT NULL,
    value_number  DECIMAL(12,3)   NULL DEFAULT NULL,

    CONSTRAINT pk_equipment_spec_values PRIMARY KEY (equipment_id, spec_field_id),
    CONSTRAINT fk_equipment_spec_values_equipment_id FOREIGN KEY (equipment_id)
        REFERENCES equipment (equipment_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_equipment_spec_values_spec_field_id FOREIGN KEY (spec_field_id)
        REFERENCES equipment_spec_fields (spec_field_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_equipment_spec_values_field_number (spec_field_id, value_number),
    INDEX idx_equipment_spec_values_field_text (spec_field_id, value_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
