-- 030_create_maintenance_requests.sql
-- ERD entity: MAINTENANCE_REQUEST
-- ERD relationships: RENTING_PARTY ||--o{ MAINTENANCE_REQUEST "submits"
--                    EQUIPMENT ||--o{ MAINTENANCE_REQUEST "needs"
--                    AREA_MANAGER |o--o{ MAINTENANCE_REQUEST "assigns"
--                    MAINTENANCE_TECH |o--o{ MAINTENANCE_REQUEST "carries out"
--
-- A renting party reports a problem with one of its listings. An area manager
-- assigns a technician whose serviced categories (maintenance_tech_categories)
-- include the equipment's category; the technician then works it through to
-- completed and records what was done. The category match is a query, not a
-- column: equipment -> equipment_types.category_id.
--
--   status          pending      submitted, waiting for an area manager
--                   assigned     a technician has been chosen
--                   in_progress  the technician started work
--                   completed    work done (technician_notes filled in)
--                   cancelled    withdrawn by the renting party before work
--                                started; kept for history
--   assigned_to     NULL until an area manager assigns. Reassigning just
--                   changes this column.
--   assigned_by     the area manager who made the latest assignment.
--   preferred_date  the day the renting party would like the work done.
--   assigned_at / started_at / completed_at / cancelled_at
--                   when the request entered that status, NULL until it does.
--   technician_notes  the technician's work notes.
--
-- Rule the PHP layer enforces, not the schema: a request that is assigned, in
-- progress or completed must have assigned_to set (the database cannot check
-- it, because MySQL/MariaDB refuse a CHECK on a column that is also a foreign
-- key with ON UPDATE CASCADE).
--
-- equipment_id and assigned_to are ON DELETE RESTRICT so maintenance history
-- keeps its listing and its technician. (RentingPartyEquipmentController
-- therefore retires a listing that has maintenance history instead of
-- deleting it, exactly as it does for rental history.)

CREATE TABLE maintenance_requests (
    request_id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    requested_by           BIGINT UNSIGNED NOT NULL,
    equipment_id           BIGINT UNSIGNED NOT NULL,
    title                  VARCHAR(150)    NOT NULL,
    description            VARCHAR(2000)   NULL DEFAULT NULL,
    preferred_date         DATE            NULL DEFAULT NULL,
    status                 ENUM(
                               'pending',
                               'assigned',
                               'in_progress',
                               'completed',
                               'cancelled'
                           )               NOT NULL DEFAULT 'pending',
    assigned_to            BIGINT UNSIGNED NULL DEFAULT NULL,
    assigned_by            BIGINT UNSIGNED NULL DEFAULT NULL,
    technician_notes       VARCHAR(2000)   NULL DEFAULT NULL,
    assigned_at            TIMESTAMP       NULL DEFAULT NULL,
    started_at             TIMESTAMP       NULL DEFAULT NULL,
    completed_at           TIMESTAMP       NULL DEFAULT NULL,
    cancelled_at           TIMESTAMP       NULL DEFAULT NULL,
    created_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                           ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_maintenance_requests PRIMARY KEY (request_id),
    CONSTRAINT fk_maintenance_requests_requested_by FOREIGN KEY (requested_by)
        REFERENCES renting_parties (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_maintenance_requests_equipment_id FOREIGN KEY (equipment_id)
        REFERENCES equipment (equipment_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_maintenance_requests_assigned_to FOREIGN KEY (assigned_to)
        REFERENCES maintenance_techs (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_maintenance_requests_assigned_by FOREIGN KEY (assigned_by)
        REFERENCES area_managers (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_maintenance_requests_requested_by (requested_by),
    INDEX idx_maintenance_requests_equipment_id (equipment_id),
    INDEX idx_maintenance_requests_assigned_to (assigned_to),
    INDEX idx_maintenance_requests_assigned_by (assigned_by),
    INDEX idx_maintenance_requests_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
