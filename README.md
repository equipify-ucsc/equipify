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

No frameworks or libraries are used anywhere. The frontend is plain HTML, CSS, and JavaScript, and the backend is plain PHP.

## Architecture

Equipify uses a **3-tier layered client–server architecture**, with the **MVC pattern** on the PHP backend.

```
 TIER 1: PRESENTATION        TIER 2: APPLICATION             TIER 3: DATA
 (browser)                   (Apache + PHP)                  (MySQL)
┌──────────────────┐  HTTP   ┌──────────────────────────┐  SQL  ┌─────────────┐
│ HTML / CSS / JS  │ ──────► │ api/index.php            │ ────► │  equipify   │
│                  │  JSON   │   → Router + role check  │ ◄──── │  database   │
│     (VIEW)       │ ◄────── │   → Controller           │       │             │
│                  │         │   → Service (optional)   │       │ tables from │
│ fetch() + DOM    │         │   → Model                │       │  schema/    │
└──────────────────┘         └──────────────────────────┘       └─────────────┘
```

- **View:** the pages in `frontend/`. They request data from the backend with `fetch()`, get JSON back, and show it on the page. PHP never generates HTML.
- **Controller:** PHP classes in `backend/controllers/`. A controller reads and validates a request, calls a model or service, and returns JSON.
- **Model:** PHP classes in `backend/models/`. Models are the only code that runs SQL, and they always use prepared statements.

### Rules

1. Each layer talks only to the layer directly below it. Pages never touch the database, controllers never write SQL, and models never read `$_POST`/`$_SESSION` or output anything.
2. The server decides. Frontend checks are only for a better user experience, so the backend validates every input again.
3. The logged-in user's identity always comes from the PHP session, never from data the browser sends.
4. Every API response uses the same JSON shape: `{ "success": true, "data": ... }` or `{ "success": false, "error": "..." }`.

### How a request flows

Example: a customer removes an item from their wishlist.

1. `frontend/Customer/Wishlist/script.js` sends `DELETE /equipify/backend/api/wishlist/42`.
2. `backend/api/.htaccess` routes the request to `backend/api/index.php`.
3. `index.php` starts the session and hands the request to the router.
4. The router finds the matching route in `routes.php`, and `Auth` checks that the user is logged in as a `customer`.
5. The wishlist controller validates `42` and calls the wishlist model with the user id from the session.
6. The model runs a prepared `DELETE` through `getDbConnection()`.
7. `Response` returns `{ "success": true }`, and the page removes the card.

## Project structure

```
equipify/
├── frontend/          Tier 1: pages (View)
│   ├── shared/        code shared by many pages (dashboard shell, login/register shell)
│   └── <Role>/<Page>/ index.html + styles.css + script.js for each page
├── backend/           Tier 2: PHP application (Controller + Model)
└── schema/            Tier 3: numbered MySQL migration files
```

### Backend

```
backend/
├── api/
│   ├── .htaccess      sends every /api/... URL to index.php
│   └── index.php      front controller: the only entry point for the browser
├── config/
│   ├── db_config.php  database settings and getDbConnection()
│   └── app_key.php    encryption key, generated on first use — git ignored, never committed
├── core/              small hand-written framework, built once and reused everywhere
│   ├── Router.php     matches method + URL to a controller method and runs the role check
│   ├── Response.php   sends JSON replies with the correct HTTP status code
│   ├── Auth.php       reads the logged-in user and role from the session; blocks with 401/403
│   ├── Validator.php  reusable input checks (integers, emails, lengths, dates, allowed values)
│   └── Crypto.php     authenticated encryption for stored secrets (payout account details)
├── routes.php         list of every API endpoint, its handler, and the roles allowed to call it
├── controllers/       one controller per module; handles requests
├── models/            one model per main table; the only place that runs SQL
├── services/          workflows that change several tables at once, run in a transaction
└── storage/
    ├── .htaccess      blocks direct browser access to uploaded files
    └── uploads/       uploaded credential documents, inspection photos, portfolio files
```

| Folder / file | Responsibility | Must not |
|---|---|---|
| `api/` | Receive every request, start the session, catch errors | Contain feature logic |
| `config/` | Hold settings, the shared database connection and the encryption key | Contain real passwords or keys in git |
| `core/` | Routing, JSON responses, authentication, validation | Know about specific features |
| `routes.php` | Map each URL to a controller method and its allowed roles | Contain logic |
| `controllers/` | Read input → validate → call model/service → respond | Run SQL or output HTML |
| `models/` | Read and write one table or entity with prepared statements | Read request data or send responses |
| `services/` | Multi-step business workflows inside a database transaction (for example, accepting a rental: confirm it, block the dates, hold the deposit, notify the customer) | Be used for simple one-table actions |
| `storage/uploads/` | Keep uploaded files private; files are served only through a controller that checks permission | Be reachable by URL |

### Adding a feature

Build each feature through every layer on its own `feature/<name>` branch:

1. `schema/`: add a new numbered migration for any new table.
2. `backend/models/`: add a model for the table.
3. `backend/controllers/`: add a controller (and a service in `backend/services/` if the action changes several tables).
4. `backend/routes.php`: register the endpoint and its allowed roles.
5. `frontend/<Role>/<Page>/script.js`: call the endpoint and render the result.

### Running locally

Open pages over HTTP, never by double-clicking the file: `fetch()` and PHP session cookies only work over HTTP. Because the frontend and backend share the same origin, no CORS setup is needed either way.

**With XAMPP (Windows).** Place the repository in XAMPP's web root (for example `C:\xampp\htdocs\equipify`), start Apache and MySQL, and open `http://localhost/equipify/frontend/...`.

**Without XAMPP (Linux/macOS).** PHP's built-in server can serve the whole project, using `dev-router.php` in place of the two `.htaccess` files Apache would apply:

```bash
php -S localhost:8000 -t . dev-router.php
```

Then open `http://localhost:8000/frontend/Customer/Login%20&%20Register%20Page/login.html` (or any other page). `dev-router.php` is a development convenience only — Apache uses the committed `.htaccess` files and ignores it.

You still need a MySQL on `127.0.0.1:3306` matching `backend/config/db_config.php`. Either install MySQL locally, or run one in Docker:

```bash
docker run -d --name equipify-mysql \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
  -p 127.0.0.1:3306:3306 mysql:8.0

# load the schema once the container is accepting connections
cd schema
docker exec -i equipify-mysql mysql -uroot < 000_create_database.sql
for f in $(ls [0-9][0-9][0-9]_*.sql | grep -v '^000_'); do
  docker exec -i equipify-mysql mysql -uroot equipify < "$f"
done
```

Afterwards, `docker stop equipify-mysql` and `docker start equipify-mysql` keep the data between sessions.

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
