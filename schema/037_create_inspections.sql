-- 037_create_inspections.sql
-- ERD entity: INSPECTION
-- ERD relationships: RENTAL ||--o{ INSPECTION "is checked by"
--                    RENTING_PARTY ||--o{ INSPECTION "carries out"
--
-- DEPENDS ON: rentals (rental_id). Run after the rentals migration.
--
-- The condition check a renting party records twice per rental: before the
-- equipment leaves (pre_handover) and after it comes back (post_return). The
-- photos live in inspection_media. Damage claims and the admin's Damage
-- Mediation page compare the two inspections of one rental.
--
--   inspection_type  pre_handover  baseline, including damage that already exists
--                    post_return   checked on return
--   checklist        JSON array of {"item": "...", "ok": true, "note": "..."}.
--                    Kept as text like equipment_spec_fields.options; PHP
--                    checks that it is valid JSON.
--   damage_noted     1 = the renting party recorded damage (existing damage
--                    for pre_handover, new damage for post_return). A
--                    post_return inspection with 0 lets the rental close and
--                    the deposit be released; 1 leads to a damage claim.
--   notes            free-text remarks.
--   acknowledged_at  when the customer confirmed a pre_handover inspection
--                    (the "pre-existing damage log"). NULL until then, and
--                    always NULL for post_return, where the customer
--                    responds to a damage claim instead.
--
-- One inspection of each type per rental (uq_inspections_rental_type).
-- inspected_by must be a renting party: the foreign key enforces it.

CREATE TABLE inspections (
    inspection_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    rental_id       BIGINT UNSIGNED NOT NULL,
    inspection_type ENUM(
                        'pre_handover',
                        'post_return'
                    )               NOT NULL,
    inspected_by    BIGINT UNSIGNED NOT NULL,
    checklist       TEXT            NULL,
    damage_noted    TINYINT(1)      NOT NULL DEFAULT 0,
    notes           VARCHAR(2000)   NULL DEFAULT NULL,
    acknowledged_at TIMESTAMP       NULL DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_inspections PRIMARY KEY (inspection_id),
    CONSTRAINT uq_inspections_rental_type UNIQUE (rental_id, inspection_type),
    CONSTRAINT fk_inspections_rental_id FOREIGN KEY (rental_id)
        REFERENCES rentals (rental_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_inspections_inspected_by FOREIGN KEY (inspected_by)
        REFERENCES renting_parties (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_inspections_damage_noted CHECK (damage_noted IN (0, 1)),

    INDEX idx_inspections_inspected_by (inspected_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
