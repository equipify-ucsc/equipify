-- 055_create_reviews.sql
-- ERD entity: REVIEW
-- ERD relationships: USER ||--o{ REVIEW "writes" (reviewer)
--                    USER ||--o{ REVIEW "receives" (reviewee)
--                    RENTAL |o--o{ REVIEW "is reviewed in"
--                    JOB |o--o{ REVIEW "is reviewed in"
--                    DELIVERY |o--o{ REVIEW "is reviewed in"
--                    MAINTENANCE_REQUEST |o--o{ REVIEW "is reviewed in"
--
-- A 1-5 star rating one user gives another about one finished piece of work.
-- This is the last migration of Week 1 because it points at rentals (032),
-- maintenance_requests (040), deliveries (041) and jobs (014).
--
--   context          Which kind of work is reviewed. Exactly the one matching
--                    id column is set and the other three are NULL
--                    (chk_reviews_context_item).
--   context_item_id  The id of that item, generated from the four columns.
--                    It exists only for uq_reviews_once: MariaDB treats NULLs
--                    in a UNIQUE index as distinct, so a key over the four
--                    nullable ids would not stop a second review.
--
-- One review per reviewer, reviewee and item. Who may rate whom, and only
-- after the work is finished, is enforced in PHP (ReviewController, Week 7),
-- which also updates the avg_rating / rating_count columns on the subtype
-- tables.
--
-- The four item FKs are RESTRICT on both delete and update: MariaDB does not
-- allow CASCADE or SET NULL on the base columns of a stored generated column,
-- and the work items are never deleted once reviewable anyway. Deleting a
-- user takes the reviews they wrote and received with them.

CREATE TABLE reviews (
    review_id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    reviewer_id            BIGINT UNSIGNED  NOT NULL,
    reviewee_id            BIGINT UNSIGNED  NOT NULL,
    context                ENUM(
                               'rental',
                               'job',
                               'delivery',
                               'maintenance'
                           )                NOT NULL,
    rental_id              BIGINT UNSIGNED  NULL DEFAULT NULL,
    job_id                 BIGINT UNSIGNED  NULL DEFAULT NULL,
    delivery_id            BIGINT UNSIGNED  NULL DEFAULT NULL,
    maintenance_request_id BIGINT UNSIGNED  NULL DEFAULT NULL,
    context_item_id        BIGINT UNSIGNED  AS (
                               COALESCE(rental_id, job_id, delivery_id, maintenance_request_id)
                           ) STORED,
    rating                 TINYINT UNSIGNED NOT NULL,
    comment                VARCHAR(1000)    NULL DEFAULT NULL,
    created_at             TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_reviews PRIMARY KEY (review_id),
    CONSTRAINT uq_reviews_once UNIQUE (reviewer_id, reviewee_id, context, context_item_id),
    CONSTRAINT fk_reviews_reviewer_id FOREIGN KEY (reviewer_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reviews_reviewee_id FOREIGN KEY (reviewee_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reviews_rental_id FOREIGN KEY (rental_id)
        REFERENCES rentals (rental_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reviews_job_id FOREIGN KEY (job_id)
        REFERENCES jobs (job_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reviews_delivery_id FOREIGN KEY (delivery_id)
        REFERENCES deliveries (delivery_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reviews_maintenance_request_id FOREIGN KEY (maintenance_request_id)
        REFERENCES maintenance_requests (request_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_reviews_not_self CHECK (reviewer_id <> reviewee_id),
    CONSTRAINT chk_reviews_context_item CHECK (
           (context = 'rental'      AND rental_id IS NOT NULL
                                    AND job_id IS NULL AND delivery_id IS NULL AND maintenance_request_id IS NULL)
        OR (context = 'job'         AND job_id IS NOT NULL
                                    AND rental_id IS NULL AND delivery_id IS NULL AND maintenance_request_id IS NULL)
        OR (context = 'delivery'    AND delivery_id IS NOT NULL
                                    AND rental_id IS NULL AND job_id IS NULL AND maintenance_request_id IS NULL)
        OR (context = 'maintenance' AND maintenance_request_id IS NOT NULL
                                    AND rental_id IS NULL AND job_id IS NULL AND delivery_id IS NULL)
    ),

    INDEX idx_reviews_reviewee_id (reviewee_id),
    INDEX idx_reviews_rental_id (rental_id),
    INDEX idx_reviews_job_id (job_id),
    INDEX idx_reviews_delivery_id (delivery_id),
    INDEX idx_reviews_maintenance_request_id (maintenance_request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
