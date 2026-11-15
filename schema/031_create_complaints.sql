-- Fresh-database definition of the existing complaint management table.
-- Do not run this CREATE against an existing complaints table. Optional future
-- workflow fields belong in a separate additive migration.
-- Target pairs mirror ComplaintModel::TARGET_ROLES; the application also rejects
-- self-targets and checks the target's current role and active account status.
CREATE TABLE complaints (
    complaint_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    complainant_id     BIGINT UNSIGNED NOT NULL,
    complainant_role   ENUM('customer', 'renting_party', 'freelance_worker',
                            'maintenance_tech', 'delivery_personnel') NOT NULL,
    against_role       ENUM('customer', 'renting_party', 'freelance_worker',
                            'maintenance_tech', 'delivery_personnel') NOT NULL,
    against_user_id    BIGINT UNSIGNED NULL DEFAULT NULL,
    category           VARCHAR(80)     NOT NULL,
    subject            VARCHAR(150)    NOT NULL,
    description        TEXT            NOT NULL,
    attachment_url     VARCHAR(500)    NULL DEFAULT NULL,
    status             ENUM('open', 'under_review', 'resolved')
                                       NOT NULL DEFAULT 'open',
    created_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_complaints PRIMARY KEY (complaint_id),
    CONSTRAINT fk_complaints_complainant_id FOREIGN KEY (complainant_id)
        REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_complaints_against_user_id FOREIGN KEY (against_user_id)
        REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_complaints_roles CHECK (
        (complainant_role = 'customer'
            AND against_role IN ('renting_party', 'freelance_worker', 'delivery_personnel'))
        OR (complainant_role = 'renting_party'
            AND against_role IN ('customer', 'freelance_worker', 'delivery_personnel', 'maintenance_tech'))
        OR (complainant_role IN ('freelance_worker', 'delivery_personnel')
            AND against_role = 'customer')
        OR (complainant_role = 'maintenance_tech' AND against_role = 'renting_party')
    ),

    INDEX idx_complaints_complainant_created (complainant_id, created_at),
    INDEX idx_complaints_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
