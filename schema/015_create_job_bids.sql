-- 015_create_job_bids.sql
-- ERD entity: JOB_BID
-- ERD relationships: JOB ||--o{ JOB_BID "receives"
--                    FREELANCE_WORKER ||--o{ JOB_BID "places"
--
-- A freelance worker's offer to do a job for a fixed total price. A worker
-- can bid once per job. The customer compares the bids and hires one: that
-- bid becomes won and every other bid on the job becomes lost. Cancelling an
-- open job also marks its bids lost.
--
--   status  submitted    waiting for the customer
--           shortlisted  reserved for a future shortlist step; nothing sets it yet
--           won / lost   decided when the customer hires someone or cancels

CREATE TABLE job_bids (
    bid_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_id          BIGINT UNSIGNED NOT NULL,
    worker_id       BIGINT UNSIGNED NOT NULL,
    bid_amount_lkr  DECIMAL(10,2)   NOT NULL,
    message         VARCHAR(1000)   NULL DEFAULT NULL,
    status          ENUM(
                        'submitted',
                        'shortlisted',
                        'won',
                        'lost'
                    )               NOT NULL DEFAULT 'submitted',
    submitted_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_job_bids PRIMARY KEY (bid_id),
    CONSTRAINT uq_job_bids_job_worker UNIQUE (job_id, worker_id),
    CONSTRAINT fk_job_bids_job_id FOREIGN KEY (job_id)
        REFERENCES jobs (job_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_job_bids_worker_id FOREIGN KEY (worker_id)
        REFERENCES freelance_workers (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_job_bids_bid_amount_lkr CHECK (bid_amount_lkr > 0),

    INDEX idx_job_bids_worker_id (worker_id),
    INDEX idx_job_bids_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
