-- 004_create_customers.sql
-- ERD entity: CUSTOMER (subtype of USER, 1:0..1)
-- The rating columns hold the ratings this customer has received, split by
-- who rated them (freelance workers vs. renting parties).

CREATE TABLE customers (
    user_id                     BIGINT UNSIGNED NOT NULL,
    company_name                VARCHAR(150)    NULL DEFAULT NULL,
    billing_address             VARCHAR(255)    NOT NULL,
    freelancer_avg_rating       DECIMAL(3,2)    NOT NULL DEFAULT 0.00,
    freelancer_rating_count     INT UNSIGNED    NOT NULL DEFAULT 0,
    renting_party_avg_rating    DECIMAL(3,2)    NOT NULL DEFAULT 0.00,
    renting_party_rating_count  INT UNSIGNED    NOT NULL DEFAULT 0,

    CONSTRAINT pk_customers PRIMARY KEY (user_id),
    CONSTRAINT fk_customers_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_customers_freelancer_avg_rating
        CHECK (freelancer_avg_rating BETWEEN 0 AND 5),
    CONSTRAINT chk_customers_renting_party_avg_rating
        CHECK (renting_party_avg_rating BETWEEN 0 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
