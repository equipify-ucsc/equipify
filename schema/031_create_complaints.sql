-- Complaints are filed by any signed-in role. The current project has no
-- rentals table, so related_reference is retained as display context only and
-- is deliberately not a foreign key.

CREATE TABLE complaints (
    complaint_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reference          VARCHAR(30)      NOT NULL,
    complainant_id     BIGINT UNSIGNED  NOT NULL,
    against_user_id    BIGINT UNSIGNED  NULL DEFAULT NULL,
    related_reference  VARCHAR(100)     NULL DEFAULT NULL,
    category           ENUM(
                           'equipment_condition', 'damage_loss', 'payment',
                           'late_no_show', 'unsafe_conditions', 'conduct',
                           'policy_fraud', 'other'
                       )                NOT NULL,
    subject            VARCHAR(150)     NOT NULL,
    description        TEXT             NOT NULL,
    status             ENUM('submitted', 'under_review', 'resolved', 'dismissed')
                                        NOT NULL DEFAULT 'submitted',
    priority           ENUM('low', 'medium', 'high', 'urgent')
                                        NOT NULL DEFAULT 'medium',
    assigned_to        BIGINT UNSIGNED  NULL DEFAULT NULL,
    resolution         TEXT             NULL DEFAULT NULL,
    resolved_at        TIMESTAMP        NULL DEFAULT NULL,
    created_at         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_complaints PRIMARY KEY (complaint_id),
    CONSTRAINT uq_complaints_reference UNIQUE (reference),
    CONSTRAINT fk_complaints_complainant_id FOREIGN KEY (complainant_id)
        REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_complaints_against_user_id FOREIGN KEY (against_user_id)
        REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_complaints_assigned_to FOREIGN KEY (assigned_to)
        REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_complaints_complainant_id (complainant_id),
    INDEX idx_complaints_status_created_at (status, created_at),
    INDEX idx_complaints_assigned_to_status (assigned_to, status),
    INDEX idx_complaints_related_reference (related_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
