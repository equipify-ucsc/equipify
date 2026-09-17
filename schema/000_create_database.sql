-- 000_create_database.sql
-- Creates the Equipify database. Run once, before any other migration.
-- All later migrations run with this database selected
-- (e.g. `mysql -u root -p equipify < 001_create_users.sql`).

CREATE DATABASE equipify
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
