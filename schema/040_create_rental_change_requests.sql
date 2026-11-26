-- 040_create_rental_change_requests.sql
-- ERD entity: RENTAL_CHANGE_REQUEST
-- ERD relationship: RENTAL ||--o{ RENTAL_CHANGE_REQUEST "is changed by"
--
-- DEPENDS ON: rentals (rental_id). Run after the rentals migration.
--
-- A customer's request to extend a rental or to return it early. The renting
-- party answers it; for an extension it first checks availability for the
-- extra days (AvailabilityService). PricingService then works out the price
-- difference: the customer pays extra for an extension, or is refunded for an
-- early return. The customer is the rental's customer and the responder is its
-- owner, so neither is repeated here.
--
--   request_type          extension    requested_end_date is later than the
--                                      current end
--                         early_return requested_end_date is earlier
--   original_end_date     the rental's end date when the request was made, so
--                         the history stays readable after the rental changes.
--   requested_end_date    the new last day of the rental.
--   amount_difference_lkr signed: positive = extra the customer pays,
--                         negative = refund. NULL until calculated.
--   status                pending   waiting for the renting party
--                         approved  accepted; the rental end date and price
--                                   are updated by RentalService
--                         rejected  declined (response_note should say why)
--                         cancelled the customer withdrew it while pending
--   reason / response_note  the customer's reason and the renting party's
--                         answer.
--   responded_at          when the renting party answered.
--
-- Several requests can exist for one rental over time (e.g. one rejected,
-- then another approved); PHP allows only one pending at a time.

CREATE TABLE rental_change_requests (
    change_request_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    rental_id             BIGINT UNSIGNED NOT NULL,
    request_type          ENUM(
                              'extension',
                              'early_return'
                          )               NOT NULL,
    original_end_date     DATE            NOT NULL,
    requested_end_date    DATE            NOT NULL,
    amount_difference_lkr DECIMAL(10,2)   NULL DEFAULT NULL,
    status                ENUM(
                              'pending',
                              'approved',
                              'rejected',
                              'cancelled'
                          )               NOT NULL DEFAULT 'pending',
    reason                VARCHAR(500)    NULL DEFAULT NULL,
    response_note         VARCHAR(500)    NULL DEFAULT NULL,
    responded_at          TIMESTAMP       NULL DEFAULT NULL,
    created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_rental_change_requests PRIMARY KEY (change_request_id),
    CONSTRAINT fk_rental_change_requests_rental_id FOREIGN KEY (rental_id)
        REFERENCES rentals (rental_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    -- The new end date must move in the direction the type says.
    CONSTRAINT chk_rental_change_requests_dates
        CHECK ((request_type = 'extension'    AND requested_end_date > original_end_date)
            OR (request_type = 'early_return' AND requested_end_date < original_end_date)),
    -- Extensions never refund; early returns never charge.
    CONSTRAINT chk_rental_change_requests_amount_difference_lkr
        CHECK (amount_difference_lkr IS NULL
            OR (request_type = 'extension'    AND amount_difference_lkr >= 0)
            OR (request_type = 'early_return' AND amount_difference_lkr <= 0)),

    INDEX idx_rental_change_requests_rental_id (rental_id),
    INDEX idx_rental_change_requests_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
