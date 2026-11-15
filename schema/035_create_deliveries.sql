-- Rental booking does not exist yet. related_reference is optional display
-- context, not a fabricated FK to a nonexistent rentals table.
CREATE TABLE deliveries (
    delivery_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    area_id BIGINT UNSIGNED NOT NULL,
    assigned_by BIGINT UNSIGNED NOT NULL,
    delivery_personnel_id BIGINT UNSIGNED NULL DEFAULT NULL,
    vehicle_id BIGINT UNSIGNED NULL DEFAULT NULL,
    related_reference VARCHAR(100) NULL DEFAULT NULL,
    pickup_address VARCHAR(500) NOT NULL,
    delivery_address VARCHAR(500) NOT NULL,
    scheduled_at DATETIME NULL DEFAULT NULL,
    status ENUM('pending', 'assigned', 'in_transit', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_deliveries PRIMARY KEY (delivery_id),
    CONSTRAINT fk_deliveries_area_id FOREIGN KEY (area_id) REFERENCES areas(area_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_deliveries_assigned_by FOREIGN KEY (assigned_by) REFERENCES area_managers(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_deliveries_personnel FOREIGN KEY (delivery_personnel_id) REFERENCES delivery_personnel(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Required by VehicleController::destroy()'s retirement fallback.
    CONSTRAINT fk_deliveries_vehicle_id FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_deliveries_area_status (area_id, status, scheduled_at),
    INDEX idx_deliveries_driver_status (delivery_personnel_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE delivery_actions (
    action_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    delivery_id BIGINT UNSIGNED NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
    previous_status ENUM('pending', 'assigned', 'in_transit', 'delivered', 'cancelled') NULL DEFAULT NULL,
    new_status ENUM('pending', 'assigned', 'in_transit', 'delivered', 'cancelled') NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_delivery_actions PRIMARY KEY (action_id),
    CONSTRAINT fk_delivery_actions_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(delivery_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_delivery_actions_actor FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_delivery_actions_created (delivery_id, created_at, action_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
