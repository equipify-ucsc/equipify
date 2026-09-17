-- 003_add_users_status_changed_by_fk.sql
-- ERD relationship: ADMIN |o--o{ USER "changes status of"
-- Added separately because users and admins reference each other.
-- If the admin account is removed, the audit pointer is cleared rather than
-- blocking the delete.

ALTER TABLE users
    ADD CONSTRAINT fk_users_status_changed_by FOREIGN KEY (status_changed_by)
        REFERENCES admins (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE;
