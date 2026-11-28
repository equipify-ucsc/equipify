-- Explicit, namespaced Week 4 extension. Not part of the numbered migration
-- sequence shared with teammates. Apply ONCE after 035 to a reviewed database.
-- Existing rows retain NULL end times and version zero; no data backfill.
ALTER TABLE deliveries
    ADD COLUMN scheduled_end_at DATETIME NULL DEFAULT NULL AFTER scheduled_at,
    ADD COLUMN assignment_version INT UNSIGNED NOT NULL DEFAULT 0,
    ADD INDEX idx_deliveries_personnel_window (delivery_personnel_id, status, scheduled_at, scheduled_end_at),
    ADD CONSTRAINT chk_deliveries_assignment_window CHECK (
        scheduled_end_at IS NULL OR (scheduled_at IS NOT NULL AND scheduled_end_at > scheduled_at)
    );
