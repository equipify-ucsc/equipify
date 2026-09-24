-- 027_drop_equipment_delivery_available.sql
-- ERD entity: EQUIPMENT
--
-- Renting parties do not deliver equipment. A customer either picks the
-- equipment up from the renting party, or books Equipify's platform delivery
-- (delivery personnel and vehicles managed by area managers). So a listing no
-- longer says whether its owner delivers, and customers no longer filter by it.

ALTER TABLE equipment
    DROP CONSTRAINT chk_equipment_delivery_available,
    DROP COLUMN delivery_available;
