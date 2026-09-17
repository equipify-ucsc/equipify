# Database schema

The Equipify MySQL database is built step by step from the numbered `.sql` files
in this folder. Each file is one migration.

## Rules

- **Naming:** `NNN_verb_object.sql`, zero-padded and numbered in the order they
  must run, e.g. `011_create_areas.sql`, `012_add_delivery_personnel_area_id.sql`.
- **Append-only:** never edit a migration once it is committed. To change the
  schema, add a new file with the next number (e.g. an `ALTER TABLE`).
- **Conventions:** InnoDB, `utf8mb4` / `utf8mb4_unicode_ci`, snake_case plural
  table names, `BIGINT UNSIGNED` ids, and named constraints
  (`pk_<table>`, `fk_<table>_<col>`, `uq_<table>_<col>`, `idx_<table>_<col>`,
  `chk_<table>_<rule>`).

## Running

Run `000_create_database.sql` once, then every other file in numeric order with
the `equipify` database selected.

MySQL CLI, from this folder:

```bash
mysql -u root -p < 000_create_database.sql
```

```bash
mysql -u root -p equipify < 001_create_users.sql
```

…and so on for each file in order.

phpMyAdmin: select the `equipify` database, then **Import** each file in order.

## Current migrations

| File | Creates |
|---|---|
| `000` | `equipify` database |
| `001`–`010` | User module: `users`, `admins`, `customers`, `renting_parties`, `freelance_workers`, `area_managers`, `maintenance_techs`, `delivery_personnel`, `credential_docs` |

`delivery_personnel.area_id` from the ERD is deferred until an `areas` table exists.
