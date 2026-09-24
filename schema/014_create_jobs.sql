-- 014_create_jobs.sql
-- ERD entity: JOB
-- ERD relationships: CUSTOMER ||--o{ JOB "posts"
--                    FREELANCE_WORKER |o--o{ JOB "is hired for"
--
-- A job offer a customer posts for freelance equipment operators. Every job is
-- fixed-price: budget_lkr is the one total the customer will pay for the whole
-- job, and bids (job_bids) are totals too.
--
--   status        draft      saved by the customer, not visible to workers
--                 open       published; workers can bid on it or decline it
--                 hired      the customer accepted a bid (hired_worker_id set)
--                 completed  the customer marked the work done
--                 cancelled  withdrawn while open; kept for history
--   published_at / hired_at / completed_at / cancelled_at
--                 when the job entered that status, NULL until it does.
--
-- A draft is hard-deleted when the customer removes it; any other job stays.
-- hired_worker_id is ON DELETE RESTRICT so a job's history keeps its worker.

CREATE TABLE jobs (
    job_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id     BIGINT UNSIGNED NOT NULL,
    title           VARCHAR(150)    NOT NULL,
    equipment       VARCHAR(100)    NOT NULL,
    description     TEXT            NULL,
    district        VARCHAR(50)     NOT NULL,
    site            VARCHAR(150)    NOT NULL,
    start_date      DATE            NOT NULL,
    end_date        DATE            NOT NULL,
    budget_lkr      DECIMAL(10,2)   NOT NULL,
    status          ENUM(
                        'draft',
                        'open',
                        'hired',
                        'completed',
                        'cancelled'
                    )               NOT NULL DEFAULT 'draft',
    hired_worker_id BIGINT UNSIGNED NULL DEFAULT NULL,
    published_at    TIMESTAMP       NULL DEFAULT NULL,
    hired_at        TIMESTAMP       NULL DEFAULT NULL,
    completed_at    TIMESTAMP       NULL DEFAULT NULL,
    cancelled_at    TIMESTAMP       NULL DEFAULT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_jobs PRIMARY KEY (job_id),
    CONSTRAINT fk_jobs_customer_id FOREIGN KEY (customer_id)
        REFERENCES customers (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_jobs_hired_worker_id FOREIGN KEY (hired_worker_id)
        REFERENCES freelance_workers (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_jobs_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_jobs_budget_lkr CHECK (budget_lkr > 0),

    INDEX idx_jobs_customer_id (customer_id),
    INDEX idx_jobs_status (status),
    INDEX idx_jobs_district (district),
    INDEX idx_jobs_hired_worker_id (hired_worker_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
