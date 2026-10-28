-- 032_create_rentals.sql
-- ERD entity: RENTAL
-- ERD relationships: CUSTOMER ||--o{ RENTAL "requests"
--                    EQUIPMENT ||--o{ RENTAL "is rented in"
--
-- One rental request and, once it is accepted, the whole rental that follows
-- from it. The renting party is not stored: it is the owner of the equipment
-- (equipment.owner_id), which never changes.
--
--   rental_ref     Shown to people, e.g. RQ-000123. It is built from rental_id,
--                  which only exists after the INSERT, so RentalModel sets it
--                  with an UPDATE in the same transaction. The column is NULL
--                  for that moment only; UNIQUE still allows it.
--   units          How many of the listing's identical units (equipment.quantity).
--   start_date / end_date
--                  The rental period. Days charged = end_date - start_date.
--                  start_date >= today + 4 and the handover on the day before
--                  start_date are checked in PHP (the 1-day response and payment
--                  deadlines need that time).
--   logistics      self_pickup: the customer collects from the renting party.
--                  platform_delivery: Equipify delivers to delivery_address.
--                  Renting parties never deliver.
--   return_logistics
--                  Chosen later, before the end of the rental; NULL until then.
--   daily_rate_lkr ... total_lkr
--                  Copied from the listing and the delivery fee table when the
--                  request is placed, so later price changes do not touch a
--                  booking. total_lkr = rental_fee_lkr + delivery_fee_lkr +
--                  deposit_lkr. late_fee_lkr grows separately while overdue.
--   status         requested         sent, waiting for the renting party
--                  accepted          accepted; agreement generated, not signed
--                  agreement_signed  the customer signed with the OTP
--                  paid              paid in full; waiting for the handover
--                  active            handed over with the pickup code
--                  overdue           not returned within 24 h of end_date
--                  returned          handed back with the return code
--                  closed            post-return inspection done, deposit settled
--                  rejected          the renting party said no (reject_reason)
--                  cancelled         the customer withdrew it (cancel_reason)
--                  expired           a deadline was missed: no response by
--                                    respond_by, or not paid by pay_by
--                  "Return due" is worked out from end_date and is not a status.
--   respond_by     End of the next calendar day after the request (23:59:59).
--   pay_by         End of the next calendar day after acceptance; covers both
--                  signing the agreement and paying.
--   *_at           When the rental entered that status, NULL until it does.
--                  The full history (who and why) is in rental_status_log.
--
-- Every TIMESTAMP except created_at / updated_at is NULL DEFAULT NULL on
-- purpose: with MariaDB's explicit_defaults_for_timestamp = OFF, the first
-- bare "TIMESTAMP NOT NULL" column silently gets ON UPDATE CURRENT_TIMESTAMP.
--
-- customer_id and equipment_id are ON DELETE RESTRICT so a rental never loses
-- its parties. This is also what makes RentingPartyEquipmentController
-- ::destroy() retire a listing with rental history instead of deleting it.

CREATE TABLE rentals (
    rental_id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    rental_ref           VARCHAR(12)     NULL DEFAULT NULL,
    customer_id          BIGINT UNSIGNED NOT NULL,
    equipment_id         BIGINT UNSIGNED NOT NULL,
    units                INT UNSIGNED    NOT NULL DEFAULT 1,
    start_date           DATE            NOT NULL,
    end_date             DATE            NOT NULL,
    logistics            ENUM(
                             'self_pickup',
                             'platform_delivery'
                         )               NOT NULL,
    return_logistics     ENUM(
                             'self_return',
                             'platform_return'
                         )               NULL DEFAULT NULL,
    delivery_address     VARCHAR(255)    NULL DEFAULT NULL,
    delivery_district    VARCHAR(50)     NULL DEFAULT NULL,
    onsite_contact_name  VARCHAR(150)    NOT NULL,
    onsite_contact_phone VARCHAR(20)     NOT NULL,
    notes                VARCHAR(500)    NULL DEFAULT NULL,
    daily_rate_lkr       DECIMAL(10,2)   NOT NULL,
    rental_fee_lkr       DECIMAL(10,2)   NOT NULL,
    delivery_fee_lkr     DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    deposit_lkr          DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    late_fee_lkr         DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    total_lkr            DECIMAL(10,2)   NOT NULL,
    status               ENUM(
                             'requested',
                             'accepted',
                             'agreement_signed',
                             'paid',
                             'active',
                             'overdue',
                             'returned',
                             'closed',
                             'rejected',
                             'cancelled',
                             'expired'
                         )               NOT NULL DEFAULT 'requested',
    respond_by           TIMESTAMP       NULL DEFAULT NULL,
    pay_by               TIMESTAMP       NULL DEFAULT NULL,
    reject_reason        VARCHAR(255)    NULL DEFAULT NULL,
    cancel_reason        VARCHAR(255)    NULL DEFAULT NULL,
    accepted_at          TIMESTAMP       NULL DEFAULT NULL,
    agreement_signed_at  TIMESTAMP       NULL DEFAULT NULL,
    paid_at              TIMESTAMP       NULL DEFAULT NULL,
    active_at            TIMESTAMP       NULL DEFAULT NULL,
    overdue_at           TIMESTAMP       NULL DEFAULT NULL,
    returned_at          TIMESTAMP       NULL DEFAULT NULL,
    closed_at            TIMESTAMP       NULL DEFAULT NULL,
    rejected_at          TIMESTAMP       NULL DEFAULT NULL,
    cancelled_at         TIMESTAMP       NULL DEFAULT NULL,
    expired_at           TIMESTAMP       NULL DEFAULT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_rentals PRIMARY KEY (rental_id),
    CONSTRAINT uq_rentals_rental_ref UNIQUE (rental_ref),
    CONSTRAINT fk_rentals_customer_id FOREIGN KEY (customer_id)
        REFERENCES customers (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_rentals_equipment_id FOREIGN KEY (equipment_id)
        REFERENCES equipment (equipment_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_rentals_dates CHECK (end_date > start_date),
    CONSTRAINT chk_rentals_units CHECK (units >= 1),
    CONSTRAINT chk_rentals_delivery_address CHECK (
        logistics = 'self_pickup'
        OR (delivery_address IS NOT NULL AND delivery_district IS NOT NULL)
    ),
    CONSTRAINT chk_rentals_daily_rate_lkr CHECK (daily_rate_lkr > 0),
    CONSTRAINT chk_rentals_rental_fee_lkr CHECK (rental_fee_lkr >= 0),
    CONSTRAINT chk_rentals_delivery_fee_lkr CHECK (delivery_fee_lkr >= 0),
    CONSTRAINT chk_rentals_deposit_lkr CHECK (deposit_lkr >= 0),
    CONSTRAINT chk_rentals_late_fee_lkr CHECK (late_fee_lkr >= 0),
    CONSTRAINT chk_rentals_total_lkr CHECK (total_lkr >= 0),

    INDEX idx_rentals_customer_id (customer_id),
    INDEX idx_rentals_equipment_dates (equipment_id, start_date, end_date),
    INDEX idx_rentals_status (status),
    INDEX idx_rentals_respond_by (respond_by),
    INDEX idx_rentals_pay_by (pay_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
