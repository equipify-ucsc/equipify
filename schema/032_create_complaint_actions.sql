CREATE TABLE complaint_actions (
    action_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    complaint_id     BIGINT UNSIGNED NOT NULL,
    actor_user_id    BIGINT UNSIGNED NULL DEFAULT NULL,
    action_type      VARCHAR(50)     NOT NULL,
    description      TEXT            NOT NULL,
    previous_status  ENUM('open', 'under_review', 'resolved') NULL DEFAULT NULL,
    new_status       ENUM('open', 'under_review', 'resolved') NULL DEFAULT NULL,
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_complaint_actions PRIMARY KEY (action_id),
    CONSTRAINT fk_complaint_actions_complaint_id FOREIGN KEY (complaint_id)
        REFERENCES complaints (complaint_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_complaint_actions_actor_user_id FOREIGN KEY (actor_user_id)
        REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_complaint_actions_complaint_created (complaint_id, created_at, action_id),
    INDEX idx_complaint_actions_actor_user_id (actor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
