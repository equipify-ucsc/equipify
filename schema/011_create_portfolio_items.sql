-- 011_create_portfolio_items.sql
-- ERD entity: PORTFOLIO_ITEM
-- ERD relationships: USER ||--o{ PORTFOLIO_ITEM "showcases"
--
-- Work samples shown on a professional's public profile. Freelance workers and
-- maintenance technicians both "showcase a portfolio of work samples", so the
-- owner is a USER rather than either subtype.
--
-- image_url holds a path relative to backend/storage (e.g. uploads/ab12….jpg),
-- never a public URL: storage/.htaccess denies direct access and the file is
-- served only through a controller that checks who is asking.

CREATE TABLE portfolio_items (
    portfolio_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id           BIGINT UNSIGNED NOT NULL,
    title             VARCHAR(150)    NOT NULL,
    equipment         VARCHAR(100)    NOT NULL,
    description       VARCHAR(1000)   NULL DEFAULT NULL,
    image_url         VARCHAR(500)    NULL DEFAULT NULL,
    completed_on      DATE            NULL DEFAULT NULL,
    created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_portfolio_items PRIMARY KEY (portfolio_item_id),
    CONSTRAINT fk_portfolio_items_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_portfolio_items_user_id (user_id),
    INDEX idx_portfolio_items_completed_on (completed_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
