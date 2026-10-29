CREATE TABLE notifications (
    notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         BIGINT UNSIGNED NOT NULL,
    type            VARCHAR(80)     NOT NULL,
    title           VARCHAR(150)    NOT NULL,
    body            TEXT            NOT NULL,
    link            VARCHAR(500)    NULL DEFAULT NULL,
    is_read         TINYINT(1)      NOT NULL DEFAULT 0,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at         TIMESTAMP       NULL DEFAULT NULL,

    CONSTRAINT pk_notifications PRIMARY KEY (notification_id),
    CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_notifications_is_read CHECK (is_read IN (0, 1)),

    INDEX idx_notifications_user_created (user_id, created_at, notification_id),
    INDEX idx_notifications_user_unread_created (user_id, is_read, created_at, notification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
