-- 039_create_damage_claims.sql
-- ERD entity: DAMAGE_CLAIM
-- ERD relationships: RENTAL ||--o| DAMAGE_CLAIM "may lead to"
--                    ADMIN |o--o{ DAMAGE_CLAIM "settles"
--
-- DEPENDS ON: rentals (rental_id). Run after the rentals migration.
--
-- A renting party's claim against the customer's deposit after a
-- post_return inspection found damage. The customer accepts or disputes it,
-- and an admin settles it on the Damage Mediation page.
--
--   description         what is damaged.
--   estimated_cost_lkr  the renting party's repair estimate.
--   status              submitted  waiting for the customer
--                       accepted   customer agrees; waiting for settlement
--                       disputed   customer disagrees (dispute_reason set)
--                       settled    admin decided; awarded_lkr is final
--   customer_responded_at / dispute_reason
--                       the customer's answer, when and why.
--   settled_by / settled_at / settlement_note
--                       which admin decided, when, and why.
--   awarded_lkr         the part of the deposit paid to the renting party.
--                       0 = nothing captured. The rest of the deposit goes
--                       back to the customer. The money movements themselves
--                       are recorded in deposit_ledger.
--
-- One claim per rental (uq_damage_claims_rental_id). It is ON DELETE RESTRICT
-- to the rental, so claim history is never lost.

CREATE TABLE damage_claims (
    claim_id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    rental_id             BIGINT UNSIGNED NOT NULL,
    description           VARCHAR(2000)   NOT NULL,
    estimated_cost_lkr    DECIMAL(10,2)   NOT NULL,
    status                ENUM(
                              'submitted',
                              'accepted',
                              'disputed',
                              'settled'
                          )               NOT NULL DEFAULT 'submitted',
    customer_responded_at TIMESTAMP       NULL DEFAULT NULL,
    dispute_reason        VARCHAR(1000)   NULL DEFAULT NULL,
    settled_by            BIGINT UNSIGNED NULL DEFAULT NULL,
    settled_at            TIMESTAMP       NULL DEFAULT NULL,
    awarded_lkr           DECIMAL(10,2)   NULL DEFAULT NULL,
    settlement_note       VARCHAR(1000)   NULL DEFAULT NULL,
    created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_damage_claims PRIMARY KEY (claim_id),
    CONSTRAINT uq_damage_claims_rental_id UNIQUE (rental_id),
    CONSTRAINT fk_damage_claims_rental_id FOREIGN KEY (rental_id)
        REFERENCES rentals (rental_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_damage_claims_settled_by FOREIGN KEY (settled_by)
        REFERENCES admins (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_damage_claims_estimated_cost_lkr CHECK (estimated_cost_lkr > 0),
    CONSTRAINT chk_damage_claims_awarded_lkr
        CHECK (awarded_lkr IS NULL OR awarded_lkr >= 0),
    -- A settled claim always records the decision.
    CONSTRAINT chk_damage_claims_settled
        CHECK (status <> 'settled' OR (awarded_lkr IS NOT NULL AND settled_at IS NOT NULL)),

    INDEX idx_damage_claims_status (status),
    INDEX idx_damage_claims_settled_by (settled_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
