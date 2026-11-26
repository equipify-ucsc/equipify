-- 035_create_rental_agreements.sql
-- ERD entity: RENTAL_AGREEMENT
-- ERD relationships: RENTAL ||--o| RENTAL_AGREEMENT "is governed by"
--                    CUSTOMER |o--o{ RENTAL_AGREEMENT "signs"
--
-- DEPENDS ON: rentals (rental_id). Run after the rentals migration.
--
-- The digital rental agreement. AgreementService builds it from the template
-- when the renting party accepts a request, and the customer signs it with a
-- one-time code (OTP) sent by email. After signing it is locked: PHP never
-- updates body or body_sha256 again.
--
--   template_version  which template text the body was built from.
--   body              the complete agreement text exactly as the parties saw
--                     it (names, equipment, period, fees, deposit, late fee),
--                     so later edits to a listing never change a signed copy.
--   body_sha256       SHA-256 of body (hex), written when it is generated.
--                     Proves the text was not altered after signing.
--   status            pending  generated, waiting for the customer
--                     signed   customer signed; locked
--                     void     the rental was cancelled or expired unsigned
--   otp_hash          SHA-256 of the code that was emailed. The code itself is
--                     never stored.
--   otp_expires_at    when that code stops working.
--   otp_attempts      wrong guesses on the current code; PHP locks the code
--                     after a few.
--   signed_at / signed_by / signed_ip
--                     the signature record: when, which customer, from which
--                     IP address (VARCHAR(45) fits IPv6, like
--                     password_resets.requested_ip).
--
-- One agreement per rental (uq_rental_agreements_rental_id). The rental link
-- is ON DELETE RESTRICT because a signed agreement is evidence and must never
-- disappear together with a rental row.

CREATE TABLE rental_agreements (
    agreement_id     BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    rental_id        BIGINT UNSIGNED  NOT NULL,
    template_version VARCHAR(20)      NOT NULL,
    body             TEXT             NOT NULL,
    body_sha256      CHAR(64)         NOT NULL,
    status           ENUM(
                         'pending',
                         'signed',
                         'void'
                     )                NOT NULL DEFAULT 'pending',
    otp_hash         CHAR(64)         NULL DEFAULT NULL,
    otp_expires_at   TIMESTAMP        NULL DEFAULT NULL,
    otp_attempts     TINYINT UNSIGNED NOT NULL DEFAULT 0,
    signed_at        TIMESTAMP        NULL DEFAULT NULL,
    signed_by        BIGINT UNSIGNED  NULL DEFAULT NULL,
    signed_ip        VARCHAR(45)      NULL DEFAULT NULL,
    created_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_rental_agreements PRIMARY KEY (agreement_id),
    CONSTRAINT uq_rental_agreements_rental_id UNIQUE (rental_id),
    CONSTRAINT fk_rental_agreements_rental_id FOREIGN KEY (rental_id)
        REFERENCES rentals (rental_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_rental_agreements_signed_by FOREIGN KEY (signed_by)
        REFERENCES customers (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    -- A signed agreement always has its time and IP address. (signed_by is
    -- left out on purpose: MySQL/MariaDB refuse a CHECK on a column that is a
    -- foreign key with ON UPDATE CASCADE, so PHP sets signed_by together with
    -- signed_at and signed_ip in the same UPDATE.)
    CONSTRAINT chk_rental_agreements_signed
        CHECK (status <> 'signed' OR (signed_at IS NOT NULL AND signed_ip IS NOT NULL)),

    INDEX idx_rental_agreements_signed_by (signed_by),
    INDEX idx_rental_agreements_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
