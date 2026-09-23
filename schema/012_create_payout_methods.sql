-- 012_create_payout_methods.sql
-- ERD entity: PAYOUT_METHOD
-- ERD relationships: USER ||--o{ PAYOUT_METHOD "is paid through"
--
-- Where a professional's earnings are sent. Owned by a USER rather than by
-- freelance_workers, because delivery personnel are paid through the platform
-- too (see the role notes); both subtypes can share this table without a
-- second migration.
--
-- Nothing that identifies an account is stored in the clear. The account
-- holder's name, the account or mobile number and the branch all live inside
-- `details_cipher`, an authenticated (AEAD) ciphertext produced by
-- core/Crypto.php. The columns beside it are only what the platform has to be
-- able to read without decrypting: which method it is, what the operator
-- called it, and whether it is the default.
--
--   details_cipher      "v1.<base64 nonce||ciphertext>" over a small JSON object.
--                       The owning user_id is bound in as associated data, so a
--                       row copied onto another user fails to decrypt instead of
--                       silently working.
--   details_fingerprint HMAC of the normalised account number, so "you already
--                       added this account" can be answered without decrypting
--                       every row. A keyed hash, not a plain one: account
--                       numbers are short and would otherwise be brute-forcible
--                       straight out of a database dump.
--   key_version         Which key encrypted this row, so keys can be rotated
--                       later without a flag day.

CREATE TABLE payout_methods (
    payout_method_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    label               VARCHAR(60)     NOT NULL,
    category            ENUM(
                            'bank_account',
                            'mobile_wallet',
                            'digital_wallet'
                        )               NOT NULL,
    provider            VARCHAR(40)     NOT NULL,
    details_cipher      VARCHAR(1024)   NOT NULL,
    details_fingerprint CHAR(64)        NOT NULL,
    key_version         TINYINT UNSIGNED NOT NULL DEFAULT 1,
    is_default          TINYINT(1)      NOT NULL DEFAULT 0,
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_payout_methods PRIMARY KEY (payout_method_id),
    CONSTRAINT fk_payout_methods_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    -- The same account cannot be added twice by one user. Scoped to the user,
    -- because a shared family account on two profiles is not our business.
    CONSTRAINT uq_payout_methods_user_fingerprint
        UNIQUE (user_id, details_fingerprint),
    CONSTRAINT chk_payout_methods_is_default
        CHECK (is_default IN (0, 1)),

    INDEX idx_payout_methods_user_id (user_id),
    INDEX idx_payout_methods_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
