-- Store only the normalized login identifier and outcome metadata. Never put
-- passwords, password hashes, session IDs, reset tokens, or auth tokens here.
CREATE TABLE login_attempts (
    login_attempt_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id          BIGINT UNSIGNED NULL DEFAULT NULL,
    identifier       VARCHAR(255)    NOT NULL,
    succeeded        TINYINT(1)      NOT NULL,
    attempted_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    request_ip       VARCHAR(45)     NULL DEFAULT NULL,
    failure_reason   VARCHAR(80)     NULL DEFAULT NULL,

    CONSTRAINT pk_login_attempts PRIMARY KEY (login_attempt_id),
    CONSTRAINT fk_login_attempts_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_login_attempts_succeeded CHECK (succeeded IN (0, 1)),

    INDEX idx_login_attempts_outcome_recent (succeeded, attempted_at),
    INDEX idx_login_attempts_identifier_recent (identifier, attempted_at),
    INDEX idx_login_attempts_user_recent (user_id, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
