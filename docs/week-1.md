# Week 1 foundations and verification

Verified on 15 November 2026 using local XAMPP PHP 8.2.12, Apache 2.4.58 and
MariaDB 10.4.32. No separate Week 1 checklist was present; scope follows the
requested areas, delivery tables, complaints/actions, notifications and security.

## Completed

| Area | Result |
| --- | --- |
| Areas | Existing `029` and `030` verified. Nullable assignments preserve registration services, district inheritance and manager roster scoping. Existing personnel remain unassigned; no district mapping or data backfill. |
| Complaints | Prior `031` compatibility fixes retained unchanged. Column definitions match the local table and `ComplaintModel`; category remains `VARCHAR(80)`, statuses remain `open`, `under_review`, `resolved`, default `open`. Existing role/target validation retained. |
| Complaint actions | `032` status snapshots match complaints; unsigned foreign keys match parent keys. Admin status updates now atomically write history. A failed audit insert rolls back the status; repeated status is a no-op. |
| Notifications | `033` and the existing notification service verified. Added session-scoped listing, unread filtering, and idempotent mark-one/mark-all APIs. Recipient identity comes from the session. Links accept local absolute paths only. |
| Login security | `034` is now used by login. Normalized email and direct peer IP are checked over a 15-minute window: five failed attempts per identifier or 30 per IP return 429 with `Retry-After: 900`. Successful, invalid-credential/wrong-portal and inactive-account outcomes are recorded. No passwords, hashes or tokens are logged. Forwarding headers are not trusted. |
| Reset URL security | `PasswordResetUrl::build()` accepts only a configured trusted URL and a 64-character hexadecimal token. It ignores Host/forwarded headers, rejects credentials, query strings, fragments, control characters and backslashes, and requires HTTPS except on loopback hosts. |
| Apache protection | Root `.htaccess` disables directory listings and denies metadata, SQL/docs/temp files, secrets/backups covered by its file rules and private backend layers. API and frontend assets remain reachable. Existing upload protection remains in place. Added nosniff/referrer headers; corrected HTTPS cookie detection for `HTTPS=off`. |
| Delivery tables | Additive `035` creates deliveries and delivery actions. FKs target existing areas, manager/personnel subtypes, users and vehicles. Vehicle deletion is RESTRICT, matching the existing controller's retirement fallback. No fabricated rentals FK: optional `related_reference` is display context until booking exists. |

## APIs and configuration

- `GET /backend/api/notifications?page=1&per_page=10&unread=1`
- `POST /backend/api/notifications/read` with `{"notification_id":123}` or `{"all":true}`.
- Existing complaint routes retain their request/response contract and permissions.
- `EQUIPIFY_DB_NAME` selects a database in the **server process environment**;
  the default is still `equipify`. It is not accepted from requests. Do not set
  this to a test database in the normal XAMPP process.
- `EQUIPIFY_PASSWORD_RESET_URL` is the complete trusted reset page URL, for
  example `https://equipify.example/frontend/reset-password.html`. For local
  development, `http://localhost/equipify/frontend/reset-password.html` is
  accepted. This is a URL-builder configuration, not an implemented reset page.

Login audit failures fail closed. Deploying these PHP changes without `034`
will prevent login. Admin complaint status changes require `032`; notification
APIs require `033`. Apply approved schema changes before enabling this code in
an application environment. No automatic schema creation is performed by PHP.

## Existing database deployment: approval required

The local `equipify` database was inspected using SHOW/DESCRIBE and read-only
transactions. It was never migrated. Complaint records were fingerprinted
before/after database tests; synthetic upgrade complaints were also checked
byte-for-byte after migrations.

For the inspected database, the pending Week 1 scripts are:

1. `029_create_areas.sql`
2. `030_add_area_ids_to_personnel.sql`
3. `032_create_complaint_actions.sql`
4. `033_create_notifications.sql`
5. `034_create_login_attempts.sql`
6. `035_create_deliveries.sql`

**Do not execute `031` on the existing database**: complaints already exists.
For a fresh database, run all numbered migrations in order, including `031`.
Numbered migrations are one-time scripts, not idempotent startup operations.
Inspect the target schema again before deployment; stop for a partially applied
`030` rather than repeating its ADD COLUMN clauses. MariaDB/MySQL DDL commits
implicitly. Take an operator-managed backup before an approved deployment.

There is no need to add complaint priority, assignment, resolution or resolved
timestamps for the current application, so no optional complaint extension was
introduced and no status/data conversion is needed.

## Reproduce verification on Windows/XAMPP

From the project root:

```powershell
./backend/tests/run_week1.ps1
# Alternative XAMPP install location:
./backend/tests/run_week1.ps1 -XamppRoot 'D:/xampp'
```

The runner creates new, uniquely named `equipify_week1_test_*` and
`equipify_week1_upgrade_*` databases; it never reuses or drops an existing
database. It reads local table definitions into the upgrade database without
copying application records, inserts synthetic legacy fixtures and applies
only missing Week 1 migrations. It runs all 34 numbered migrations after `000`
in the fresh database (including the catalogue seed and historical alterations).
Database creation permission is required for the configured local MySQL user.

The runner starts a separate hidden Apache instance on **127.0.0.1:18081** with
only the temporary database selected. It does not change XAMPP configuration or
stop any existing listener. A test-only response header proves the server is
using the intended temporary database before HTTP mutation tests start. The
runner stops only its own Apache processes in `finally` and restores its process
environment. In restricted execution environments Apache may need permission
to run outside the runner sandbox. Production must not use the test config/header.

Logs/configuration are under ignored `tmp/week1/`. Test databases are deliberately
retained and their names printed for inspection; no cleanup deletion is automatic.
Run the whole suite again to obtain fresh fixtures rather than rerunning only
the HTTP tests against fixtures already modified by a previous HTTP run.

Latest complete verification:

- 34 ordered fresh-database migrations and six pending Week 1 scripts on a
  local-schema clone passed.
- 48 integration/security assertions passed: compatible personnel registration,
  nullable legacy area assignment, complaint preservation/filters, role CHECKs,
  transactional complaint audit/rollback, delivery FKs/history retention,
  notification ownership/link validation, login limit/expiry, reset URL rejection.
- Existing complaint suites passed: 132 policy/database checks and 38 controller
  checks against synthetic data. The policy count varies with database fixtures.
- 62 real Apache/API/security assertions passed: private-file denial, public
  assets, role gates, complaint submission/filtering/status audit, vehicle
  retirement fallback, notification ownership, login outcomes/throttling,
  session cookie flags and logout.
- All 73 backend PHP files passed syntax checks; `git diff --check` passed.

## Remaining work and limits

- No existing `equipify` migrations were approved or executed. New database-backed
  features cannot be used there until the listed migrations are approved/applied.
- There is no existing reset-token storage, reset API/page or configured mail
  transport. This change secures the URL-building foundation only. End-to-end
  email reset, token expiry/single use and password rotation were **not** tested
  or represented as implemented. A future reset service must generate tokens
  with `random_bytes`, store only hashes, enforce expiry/single use, return generic
  request responses and call the trusted URL builder. Do not expose tokens in logs.
- Delivery assignment/status UI and area assignment APIs are future workflows;
  `035` supplies tables only. Future assignment code must validate that manager,
  driver, vehicle and area belong together and lock resources when allocating
  them. These cross-row rules are not enforced by individual foreign keys.
- Existing freelancer mock notification routes/UI were left untouched. The new
  persisted `/notifications` API is available for later UI integration; this
  change does not silently replace mock dashboard counts or unrelated workflows.
- Schema review found preexisting gaps outside Week 1: messaging models require
  `conversations`, `conversation_participants` and `messages`, present locally
  but absent from numbered migrations (there is no `028`). The local database
  also lacks `jobs`, `job_bids` and `job_declines`, although migrations `014`-`016`
  create them successfully in fresh tests. No unrelated teammate messaging/job
  code or live schema was changed. A fresh database still needs the messaging
  owner's migration before messaging APIs can work; full messaging/job regression
  suites were not executed in this Week 1 scope.
- Production HTTPS/proxy behavior, concurrent brute-force load, SMTP delivery,
  a separate Oracle MySQL server and browser visual testing were not executed.
  The tested database is XAMPP MariaDB. Configure trusted proxy handling before
  deployment behind a proxy; direct-peer IP limits would otherwise aggregate
  proxied users. Add edge rate limiting for concurrent/distributed abuse and an
  operator-defined login-attempt retention job before production scale.
- XAMPP Apache logged an optional `pdo_sqlite` startup-extension warning. MySQL
  PDO and every executed test succeeded; no XAMPP installation files were altered.
