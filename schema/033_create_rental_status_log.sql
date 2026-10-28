-- 033_create_rental_status_log.sql
-- ERD entity: RENTAL_STATUS_LOG
-- ERD relationships: RENTAL ||--o{ RENTAL_STATUS_LOG "has history"
--                    USER |o--o{ RENTAL_STATUS_LOG "changes"
--
-- One row for every status change of a rental, written in the same
-- transaction as the change itself. It feeds the rental timelines, the
-- evidence pack (Week 8) and admin investigations, so rows are only ever
-- added, never edited.
--
--   from_status  NULL on the first row (the request being placed).
--   changed_by   The user who caused the change; NULL = the system (a missed
--                deadline, the overdue job). RESTRICT so the log keeps its
--                actor.
--   note         The reason given, e.g. the reject or cancel reason.
--
-- The two ENUMs must list exactly the same values as rentals.status (032).

CREATE TABLE rental_status_log (
    log_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    rental_id   BIGINT UNSIGNED NOT NULL,
    from_status ENUM(
                    'requested',
                    'accepted',
                    'agreement_signed',
                    'paid',
                    'active',
                    'overdue',
                    'returned',
                    'closed',
                    'rejected',
                    'cancelled',
                    'expired'
                )               NULL DEFAULT NULL,
    to_status   ENUM(
                    'requested',
                    'accepted',
                    'agreement_signed',
                    'paid',
                    'active',
                    'overdue',
                    'returned',
                    'closed',
                    'rejected',
                    'cancelled',
                    'expired'
                )               NOT NULL,
    changed_by  BIGINT UNSIGNED NULL DEFAULT NULL,
    note        VARCHAR(255)    NULL DEFAULT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_rental_status_log PRIMARY KEY (log_id),
    CONSTRAINT fk_rental_status_log_rental_id FOREIGN KEY (rental_id)
        REFERENCES rentals (rental_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_rental_status_log_changed_by FOREIGN KEY (changed_by)
        REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_rental_status_log_rental_created (rental_id, created_at),
    INDEX idx_rental_status_log_changed_by (changed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
