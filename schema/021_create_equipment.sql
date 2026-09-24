-- 021_create_equipment.sql
-- ERD entity: EQUIPMENT (a listing)
-- ERD relationships: RENTING_PARTY ||--o{ EQUIPMENT "lists"
--                    EQUIPMENT_TYPE ||--o{ EQUIPMENT "classifies"
--
-- One real item (or a set of identical items, see quantity) that a renting
-- party offers for rent. Its category follows from its type.
--
--   daily_rate_lkr     The only price: LKR per day. There are deliberately no
--                      hourly, weekly or per-event rates.
--   deposit_lkr        Refundable security deposit, 0 = none.
--   quantity           How many identical units this listing covers (chairs,
--                      barriers, scaffolding sets); 1 for a single machine.
--   delivery_available The renting party can deliver it. There is
--                      deliberately no operator-availability flag.
--   extra_specs        Free-text specs, used by "Other ..." types which have
--                      no structured spec fields.
--   status             available / on_rent / maintenance are set by the
--                      renting party; retired hides the listing everywhere
--                      but keeps the row for history.
--
-- owner_id and type_id are ON DELETE RESTRICT so a listing never loses its
-- owner or its type. Future rental tables must reference equipment_id with ON
-- DELETE RESTRICT too: RentingPartyEquipmentController::destroy() tries a hard
-- delete and falls back to retiring the listing when a FK refuses (MySQL 1451).

CREATE TABLE equipment (
    equipment_id       BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    owner_id           BIGINT UNSIGNED   NOT NULL,
    type_id            BIGINT UNSIGNED   NOT NULL,
    title              VARCHAR(150)      NOT NULL,
    brand              VARCHAR(80)       NULL DEFAULT NULL,
    model              VARCHAR(80)       NULL DEFAULT NULL,
    year_made          SMALLINT UNSIGNED NULL DEFAULT NULL,
    serial_no          VARCHAR(80)       NULL DEFAULT NULL,
    condition_grade    ENUM(
                           'excellent',
                           'good',
                           'fair'
                       )                 NOT NULL,
    district           VARCHAR(50)       NOT NULL,
    address            VARCHAR(255)      NOT NULL,
    daily_rate_lkr     DECIMAL(10,2)     NOT NULL,
    deposit_lkr        DECIMAL(10,2)     NOT NULL DEFAULT 0.00,
    quantity           INT UNSIGNED      NOT NULL DEFAULT 1,
    delivery_available TINYINT(1)        NOT NULL DEFAULT 0,
    description        VARCHAR(2000)     NULL DEFAULT NULL,
    extra_specs        VARCHAR(1000)     NULL DEFAULT NULL,
    status             ENUM(
                           'available',
                           'on_rent',
                           'maintenance',
                           'retired'
                       )                 NOT NULL DEFAULT 'available',
    created_at         TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_equipment PRIMARY KEY (equipment_id),
    CONSTRAINT fk_equipment_owner_id FOREIGN KEY (owner_id)
        REFERENCES renting_parties (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_equipment_type_id FOREIGN KEY (type_id)
        REFERENCES equipment_types (type_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_equipment_daily_rate_lkr CHECK (daily_rate_lkr > 0),
    CONSTRAINT chk_equipment_deposit_lkr CHECK (deposit_lkr >= 0),
    CONSTRAINT chk_equipment_quantity CHECK (quantity >= 1),
    CONSTRAINT chk_equipment_delivery_available CHECK (delivery_available IN (0, 1)),

    INDEX idx_equipment_owner_id (owner_id),
    INDEX idx_equipment_type_id (type_id),
    INDEX idx_equipment_district (district),
    INDEX idx_equipment_status (status),
    INDEX idx_equipment_daily_rate_lkr (daily_rate_lkr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
