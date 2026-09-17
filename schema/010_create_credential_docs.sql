-- 010_create_credential_docs.sql
-- ERD entity: CREDENTIAL_DOC
-- ERD relationships: USER ||--o{ CREDENTIAL_DOC "uploads"
--                    ADMIN |o--o{ CREDENTIAL_DOC "verifies"

CREATE TABLE credential_docs (
    credential_doc_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    doc_type            ENUM(
                            'nic',
                            'driving_license',
                            'business_registration',
                            'professional_certificate',
                            'other'
                        )               NOT NULL,
    file_url            VARCHAR(500)    NOT NULL,
    verification_status ENUM(
                            'pending',
                            'verified',
                            'rejected'
                        )               NOT NULL DEFAULT 'pending',
    verified_by         BIGINT UNSIGNED NULL DEFAULT NULL,
    rejection_reason    VARCHAR(255)    NULL DEFAULT NULL,
    submitted_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at         TIMESTAMP       NULL DEFAULT NULL,

    CONSTRAINT pk_credential_docs PRIMARY KEY (credential_doc_id),
    CONSTRAINT fk_credential_docs_user_id FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_credential_docs_verified_by FOREIGN KEY (verified_by)
        REFERENCES admins (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_credential_docs_user_id (user_id),
    INDEX idx_credential_docs_verification_status (verification_status),
    INDEX idx_credential_docs_verified_by (verified_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
