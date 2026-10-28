-- 031_create_wishlists.sql
-- ERD entity: WISHLIST
-- ERD relationships: CUSTOMER ||--o{ WISHLIST "saves"
--                    EQUIPMENT ||--o{ WISHLIST "is saved in"
--
-- One row per listing a customer has saved with the heart on the Browsing or
-- Detailed page. The composite primary key means the same listing can only be
-- saved once; saving it again is a no-op in WishlistModel, not a second row.
--
-- Deleting a customer removes their wishlist (CASCADE). equipment_id is ON
-- DELETE RESTRICT like every FK to equipment: a listing someone has saved is
-- retired instead of deleted (RentingPartyEquipmentController::destroy()), and
-- the Wishlist page shows it as "Unavailable" rather than silently dropping it.

CREATE TABLE wishlists (
    customer_id  BIGINT UNSIGNED NOT NULL,
    equipment_id BIGINT UNSIGNED NOT NULL,
    created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_wishlists PRIMARY KEY (customer_id, equipment_id),
    CONSTRAINT fk_wishlists_customer_id FOREIGN KEY (customer_id)
        REFERENCES customers (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_wishlists_equipment_id FOREIGN KEY (equipment_id)
        REFERENCES equipment (equipment_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_wishlists_equipment_id (equipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
