-- 029_create_equipment_blackouts.sql
-- ERD entity: EQUIPMENT_BLACKOUT
-- ERD relationship: EQUIPMENT ||--o{ EQUIPMENT_BLACKOUT "is blocked by"
--
-- A date range in which a renting party does not want a listing rented (own
-- use, a planned service, a public event, ...). AvailabilityService counts
-- these together with overlapping rentals and compares the total with
-- equipment.quantity, so a blackout can block only some of the units.
--
--   start_date / end_date  Both days are included in the blackout.
--   units_blocked          How many units are unavailable. 1 blocks a single
--                          machine completely; for a listing with quantity 20
--                          it can block, say, 5 of the 20.
--                          PHP keeps it at or below equipment.quantity.
--   reason                 Optional note for the owner only.
--
-- A blackout is not history, so it goes with its listing (ON DELETE CASCADE).
-- The composite index serves the overlap check:
--   WHERE equipment_id = ? AND start_date <= ? AND end_date >= ?

CREATE TABLE equipment_blackouts (
    blackout_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    equipment_id  BIGINT UNSIGNED NOT NULL,
    start_date    DATE            NOT NULL,
    end_date      DATE            NOT NULL,
    units_blocked INT UNSIGNED    NOT NULL DEFAULT 1,
    reason        VARCHAR(255)    NULL DEFAULT NULL,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_equipment_blackouts PRIMARY KEY (blackout_id),
    CONSTRAINT fk_equipment_blackouts_equipment_id FOREIGN KEY (equipment_id)
        REFERENCES equipment (equipment_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_equipment_blackouts_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_equipment_blackouts_units_blocked CHECK (units_blocked >= 1),

    INDEX idx_equipment_blackouts_equipment_dates (equipment_id, start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
