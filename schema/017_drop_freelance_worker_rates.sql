-- 017_drop_freelance_worker_rates.sql
-- Jobs are fixed-price only (see 014_create_jobs.sql): a worker quotes a total
-- in each bid instead of advertising an hourly or daily rate, so the two rate
-- columns from 006 and their checks are removed.

ALTER TABLE freelance_workers
    DROP CONSTRAINT chk_freelance_workers_hourly_rate,
    DROP CONSTRAINT chk_freelance_workers_daily_rate,
    DROP COLUMN hourly_rate,
    DROP COLUMN daily_rate;
