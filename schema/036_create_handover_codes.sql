-- 036_create_handover_codes.sql
-- ERD entity: HANDOVER_CODE
-- ERD relationship: RENTAL ||--o{ HANDOVER_CODE "is confirmed with"
--
-- DEPENDS ON: rentals (rental_id). Run after the rentals migration.
--
-- The one-time codes that prove a handover really happened. The customer is
-- shown the code (rental card and email) and reads it out to the person
-- handing over or collecting the equipment, who types it in.
--
--   purpose         handover  the equipment goes to the customer (self-pickup
--                             or platform delivery); entering it makes the
--                             rental Active
--                   return    the equipment comes back; entering it makes the
--                             rental Returned
--   code_cipher     the code, encrypted with core/Crypto.php. It is not
--                   hashed because the customer must be able to see it again
--                   on the rental card. Suggested use:
--                     Crypto::encrypt(['code' => '482913'],
--                                     'handover_code:' . $rentalId . ':' . $purpose)
--   expires_at      the code stops working after this time. PHP always sets it.
--                   It is NULL DEFAULT NULL, not NOT NULL, on purpose: on older
--                   MariaDB (explicit_defaults_for_timestamp = OFF, as in XAMPP)
--                   a bare TIMESTAMP NOT NULL silently becomes
--                   ON UPDATE CURRENT_TIMESTAMP and would reset on every update.
--   failed_attempts wrong entries so far; PHP locks the code after a few, so
--                   a 6-digit code cannot be guessed by trial.
--   used_at / used_by
--                   when the code was accepted and who typed it in (renting
--                   party or delivery person). NULL = not used yet. A used
--                   code is never accepted again.
--
-- One row per rental and purpose: issuing a fresh code updates the same row
-- (new code_cipher, expires_at, failed_attempts = 0).

CREATE TABLE handover_codes (
    handover_code_id BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    rental_id        BIGINT UNSIGNED  NOT NULL,
    purpose          ENUM(
                         'handover',
                         'return'
                     )                NOT NULL,
    code_cipher      VARCHAR(255)     NOT NULL,
    expires_at       TIMESTAMP        NULL DEFAULT NULL,
    failed_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    used_at          TIMESTAMP        NULL DEFAULT NULL,
    used_by          BIGINT UNSIGNED  NULL DEFAULT NULL,
    created_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_handover_codes PRIMARY KEY (handover_code_id),
    CONSTRAINT uq_handover_codes_rental_purpose UNIQUE (rental_id, purpose),
    CONSTRAINT fk_handover_codes_rental_id FOREIGN KEY (rental_id)
        REFERENCES rentals (rental_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_handover_codes_used_by FOREIGN KEY (used_by)
        REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_handover_codes_used_by (used_by),
    INDEX idx_handover_codes_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
