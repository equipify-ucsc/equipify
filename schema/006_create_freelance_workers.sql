-- 006_create_freelance_workers.sql
-- ERD entity: FREELANCE_WORKER (subtype of USER, 1:0..1)

CREATE TABLE freelance_workers (
    user_id             BIGINT UNSIGNED NOT NULL,
    bio                 TEXT            NULL,
    years_experience    INT UNSIGNED    NULL DEFAULT NULL,
    hourly_rate         DECIMAL(10,2)   NULL DEFAULT NULL,
    daily_rate          DECIMAL(10,2)   NULL DEFAULT NULL,
    availability_status ENUM(
                            'available',
                            'busy',
                            'unavailable'
                        )               NOT NULL DEFAULT 'available',
    verification_status ENUM(
                            'pending',
                            'verified',
                            'rejected'
                        )               NOT NULL DEFAULT 'pending',
    avg_rating          DECIMAL(3,2)    NOT NULL DEFAULT 0.00,
    rating_count        INT UNSIGNED    NOT NULL DEFAULT 0,

    CONSTRAINT pk_freelance_workers PRIMARY KEY (user_id),
    CONSTRAINT fk_freelance_workers_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_freelance_workers_hourly_rate
        CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
    CONSTRAINT chk_freelance_workers_daily_rate
        CHECK (daily_rate IS NULL OR daily_rate >= 0),
    CONSTRAINT chk_freelance_workers_avg_rating
        CHECK (avg_rating BETWEEN 0 AND 5),

    INDEX idx_freelance_workers_availability_status (availability_status),
    INDEX idx_freelance_workers_verification_status (verification_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
