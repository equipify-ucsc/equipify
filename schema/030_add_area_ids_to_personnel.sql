-- Existing personnel are intentionally left unassigned. Admin Ops can assign
-- areas after reviewing the roster; no district-to-area mapping is assumed.
-- Nullable area_id preserves every existing row and allows staged assignment.

ALTER TABLE area_managers
    ADD COLUMN area_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER user_id,
    ADD INDEX idx_area_managers_area_id (area_id),
    ADD CONSTRAINT fk_area_managers_area_id FOREIGN KEY (area_id)
        REFERENCES areas (area_id)
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE delivery_personnel
    ADD COLUMN area_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER user_id,
    ADD INDEX idx_delivery_personnel_area_id (area_id),
    ADD CONSTRAINT fk_delivery_personnel_area_id FOREIGN KEY (area_id)
        REFERENCES areas (area_id)
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE maintenance_techs
    ADD COLUMN area_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER user_id,
    ADD INDEX idx_maintenance_techs_area_id (area_id),
    ADD CONSTRAINT fk_maintenance_techs_area_id FOREIGN KEY (area_id)
        REFERENCES areas (area_id)
        ON DELETE RESTRICT ON UPDATE CASCADE;
