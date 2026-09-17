# Equipify
 
A B2B equipment rental platform connecting customers, renting parties, and freelance workers across Sri Lanka's construction and industrial sectors.
 
## About the project
 
Equipify is a group project developed for SCS2301 Group Project at the University of Colombo School of Computing (UCSC), supervised by Mr. M. Kovarthan and Mr. Thulasigaran.
 
The platform enables:
- **Customers** to browse and book industrial/construction equipment
- **Renting parties** to list and manage their equipment inventory
- **Freelance workers** to offer delivery and operational services
- **Admins** to oversee platform activity and manage disputes
## Tech stack
 
| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | PHP |
| Database | MySQL |

## Database

The database is built step by step from numbered migration files in `schema/`, named `NNN_verb_object.sql` (e.g. `001_create_users.sql`, `003_add_users_status_changed_by_fk.sql`).

- **Run in order:** run `000_create_database.sql` once, then every later file in numeric order with the `equipify` database selected.
- **Append-only:** never edit a migration once it is committed. To change the schema, add a new file with the next number (e.g. an `ALTER TABLE`).
- **Conventions:** InnoDB, `utf8mb4` / `utf8mb4_unicode_ci`, plural snake_case table names, `BIGINT UNSIGNED` ids, and named constraints (`pk_<table>`, `fk_<table>_<col>`, `uq_<table>_<col>`, `idx_<table>_<col>`, `chk_<table>_<rule>`).

MySQL CLI, from the `schema/` folder:

```bash
mysql -u root -p < 000_create_database.sql
mysql -u root -p equipify < 001_create_users.sql
```

…and so on for each file in order. In phpMyAdmin, select the `equipify` database and **Import** each file in order.

### Connecting from PHP

PHP code gets its connection from `getDbConnection()` in `backend/config/db_config.php` (PDO) instead of opening its own:

```php
require_once __DIR__ . '/../config/db_config.php';
$db = getDbConnection();
```

The file is committed with XAMPP's defaults (`root`, empty password). If your local MySQL uses a different password, change it locally but **never commit a real password**.

Notes:
- The connection turns on strict SQL mode and Sri Lanka time (`+05:30`). XAMPP's default mode silently stores invalid `ENUM` values as `''` instead of raising an error, so keep that in mind when running SQL by hand in phpMyAdmin or the CLI.

## Branching strategy
 
- `main` — stable, always working. No direct commits.
- `dev` — integration branch. All feature branches merge here first.
- `feature/<name>` — one branch per feature/module, e.g. `feature/customer-browsing`, `feature/admin-panel`.
Workflow: branch off `dev` → commit your work → push → open a pull request into `dev` → get it reviewed → merge.
