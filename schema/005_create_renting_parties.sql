-- 005_create_renting_parties.sql
-- ERD entity: RENTING_PARTY (subtype of USER, 1:0..1)

CREATE TABLE renting_parties (
    user_id             BIGINT UNSIGNED NOT NULL,
    business_name       VARCHAR(150)    NOT NULL,
    business_reg_no     VARCHAR(50)     NOT NULL,
    business_address    VARCHAR(255)    NOT NULL,
    district            VARCHAR(50)     NOT NULL,
    description         TEXT            NULL,
    logo_url            VARCHAR(500)    NULL DEFAULT NULL,
    verification_status ENUM(
                            'pending',
                            'verified',
                            'rejected'
                        )               NOT NULL DEFAULT 'pending',
    avg_rating          DECIMAL(3,2)    NOT NULL DEFAULT 0.00,
    rating_count        INT UNSIGNED    NOT NULL DEFAULT 0,

    CONSTRAINT pk_renting_parties PRIMARY KEY (user_id),
    CONSTRAINT uq_renting_parties_business_reg_no UNIQUE (business_reg_no),
    CONSTRAINT fk_renting_parties_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_renting_parties_avg_rating
        CHECK (avg_rating BETWEEN 0 AND 5),

    INDEX idx_renting_parties_district (district),
    INDEX idx_renting_parties_verification_status (verification_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
