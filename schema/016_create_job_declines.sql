-- 016_create_job_declines.sql
-- ERD relationship: FREELANCE_WORKER }o--o{ JOB "declines"
--
-- Records that one worker clicked "Not interested" on an open job. The job
-- stays open for everyone else, so this can't live in jobs.status, and a
-- decline isn't a bid, so it doesn't belong in job_bids either.
--
-- Used to show that worker the job as "Declined" on their Job Offers list and
-- to refuse a later bid from them. The customer never sees declines. The
-- composite key keeps one row per (job, worker) pair.

CREATE TABLE job_declines (
    job_id       BIGINT UNSIGNED NOT NULL,
    worker_id    BIGINT UNSIGNED NOT NULL,
    declined_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_job_declines PRIMARY KEY (job_id, worker_id),
    CONSTRAINT fk_job_declines_job_id FOREIGN KEY (job_id)
        REFERENCES jobs (job_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_job_declines_worker_id FOREIGN KEY (worker_id)
        REFERENCES freelance_workers (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_job_declines_worker_id (worker_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
