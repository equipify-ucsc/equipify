-- 013_create_vehicles.sql
-- ERD entity: VEHICLE
-- ERD relationship: AREA_MANAGER ||--o{ VEHICLE "manages"
--
-- A vehicle has no driver of its own: the area manager picks a vehicle and a
-- delivery person separately for each delivery. managed_by scopes the fleet the
-- same way delivery_personnel.registered_by scopes the roster, until an areas
-- table exists.
--
--   max_load_kg     Payload capacity, whole kilograms.
--   cargo_length_m  Usable cargo-bed length, metres.
--   cargo_width_m   Usable cargo-bed width, metres.
--   status          available / maintenance are set by the area manager;
--                   in_use is reserved for the delivery-assignment workflow.
--   retired_at      NULL = active. Set instead of deleting when the vehicle
--                   already has delivery history, so that history keeps its
--                   vehicle. A retired vehicle keeps its plate and can be
--                   restored.
--
-- IMPORTANT for the future deliveries migration: its vehicle_id FK must be
-- ON DELETE RESTRICT. VehicleController::destroy() tries a hard delete first
-- and falls back to retiring the vehicle when that FK refuses it (MySQL error
-- 1451); CASCADE or SET NULL would silently destroy or orphan the history.

CREATE TABLE vehicles (
    vehicle_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    managed_by      BIGINT UNSIGNED NOT NULL,
    plate_number    VARCHAR(15)     NOT NULL,
    vehicle_type    ENUM(
                        'van',
                        'pickup',
                        'lorry',
                        'truck',
                        'flatbed',
                        'low_bed_trailer'
                    )               NOT NULL,
    max_load_kg     INT UNSIGNED    NOT NULL,
    cargo_length_m  DECIMAL(5,2)    NOT NULL,
    cargo_width_m   DECIMAL(4,2)    NOT NULL,
    status          ENUM(
                        'available',
                        'in_use',
                        'maintenance'
                    )               NOT NULL DEFAULT 'available',
    retired_at      TIMESTAMP       NULL DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_vehicles PRIMARY KEY (vehicle_id),
    -- A physical plate is unique platform-wide, not just within one area.
    CONSTRAINT uq_vehicles_plate_number UNIQUE (plate_number),
    CONSTRAINT fk_vehicles_managed_by FOREIGN KEY (managed_by)
        REFERENCES area_managers (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_vehicles_max_load_kg CHECK (max_load_kg > 0),
    CONSTRAINT chk_vehicles_cargo_length_m CHECK (cargo_length_m > 0),
    CONSTRAINT chk_vehicles_cargo_width_m CHECK (cargo_width_m > 0),

    INDEX idx_vehicles_managed_by (managed_by),
    INDEX idx_vehicles_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
