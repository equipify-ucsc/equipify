-- 028_create_password_resets.sql
-- ERD relationship: USER ||--o{ PASSWORD_RESET "requests"
--
-- One row per "forgot password" request. The token that goes out in the email
-- is never stored: only its SHA-256, so a stolen database dump cannot be used
-- to take over an account. A link is single use (used_at) and short lived
-- (expires_at, an hour from PasswordResetController::TTL_MINUTES).
--
-- created_at is not just bookkeeping -- it is what the per-account throttle
-- counts, since this codebase has no other rate limiting.
--
-- Rows are kept after use rather than deleted: they are the only record that a
-- password was reset, and they cost nothing. A CASCADE on the user takes them.

CREATE TABLE password_resets (
    reset_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id      BIGINT UNSIGNED NOT NULL,
    token_hash   CHAR(64)        NOT NULL,
    expires_at   TIMESTAMP       NOT NULL,
    used_at      TIMESTAMP       NULL DEFAULT NULL,
    requested_ip VARCHAR(45)     NULL DEFAULT NULL,
    created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_password_resets PRIMARY KEY (reset_id),
    CONSTRAINT uq_password_resets_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_password_resets_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_password_resets_user_id (user_id),
    INDEX idx_password_resets_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
