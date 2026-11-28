# Week 4: personnel and vehicle assignment

Verified on 28 November 2026 (Asia/Colombo), on `feature/admin-ui-updates`, based on pushed checkpoint `4465f9d`. No merge, commit or push was performed. The real `equipify` database was never selected or modified during implementation/testing.

## Scope and readiness

**READY for a Week 4 resource-assignment checkpoint and review. NOT READY for a complete production delivery rollout.** Personnel and vehicle reservation, reassignment, rescheduling, cancellation, resource release and explicit delivery progress are implemented for existing deliveries. Authoritative rental/payment/agreement integration remains a teammate dependency. The pre-existing messaging regression suite also requires missing messaging migrations.

| Requirement | Result |
| --- | --- |
| Database-backed, area-scoped deliveries and eligible personnel | Complete |
| Atomic personnel reservation, reassignment and rescheduling | Complete |
| Overlap prevention, optimistic version checks and concurrency handling | Complete |
| Valid cancellation with retained audit/history | Complete |
| Transactional notifications to new and previous personnel | Complete |
| Responsive controls, confirmation dialogs, feedback and status display | Complete |
| Filters, pagination, loading/empty/error states and session protection | Preserved and tested |
| Area-scoped vehicle eligibility, overlap prevention and atomic resource assignment | Complete |
| Vehicle reassignment, cancellation/release and guarded fleet edits | Complete |
| Explicit Assigned -> In transit -> Delivered transitions | Complete |
| Production delivery creation from real paid rentals | Blocked on teammate lifecycle/schema integration |
| Full messaging regression on a fresh checkout database | Blocked on missing messaging tables/migrations |

## Existing schema and implementation

`035_create_deliveries.sql` already provides `deliveries` and `delivery_actions`. Each delivery has an area, responsible manager, nullable personnel/vehicle resources, reference, addresses, start time and lifecycle status. Personnel have an area, account status, licence expiry/class and a global availability flag. Vehicles belong to managers, inherit area scope through those managers, and have maintenance/in-use/retirement state and capacity fields. Personnel do not belong to vehicles.

The existing `DeliveryModel`, `DeliveryController`, `VehicleModel`, `AreaManagerModel::operationalArea()` and `NotificationService` are reused. No second delivery subsystem, assignment endpoint or roster CRUD was introduced. `createFromRental()` still fails closed for unsupported rental integration. The existing assignment operation now accepts an optional, server-validated `vehicle_id`; supplied area, actor or final status fields remain forbidden.

### Explicit schema extension

Existing Week 4 file: `schema/extensions/week4_delivery_personnel_assignment.sql`. **The vehicle phase requires no additional schema changes or migration numbers.** Existing vehicle foreign keys/indexes and status fields are reused.

- Adds nullable `scheduled_end_at DATETIME`, without fabricating end times for existing deliveries.
- Adds `assignment_version INT UNSIGNED NOT NULL DEFAULT 0` for stale-write protection.
- Adds a personnel/status/time-window index and a check requiring a provided end to follow a non-null start.
- Preserves all existing resource foreign keys and status values. No new numbered migration competes with teammate branches.

Apply this file **once**, after schema 035, to a reviewed target schema as a separate deployment step. It is deliberately outside the numbered glob and is not automatically applied by the application. `run_week4.ps1` applies it only inside a newly created synthetic database. Do not run it against the real database as part of testing. MariaDB/MySQL DDL auto-commits; a future rollout needs a backup and a reviewed migration ledger/integration order.

Before the extension is installed, the existing delivery listing works with `assignment_supported: false`; the page remains read-only and assignment endpoints return 409. Existing rows are not backfilled. An active personnel or vehicle booking with an unknown start/end conservatively blocks that resource's new bookings until the legacy booking is explicitly resolved by its owner. An orphaned `in_use` vehicle without an identifiable active delivery is also unavailable; it is not silently released by a listing request.

### Scheduling, status and concurrency contract

Start and end are explicit local Sri Lanka times. Accepted formats are `YYYY-MM-DD HH:mm:ss`, `YYYY-MM-DDTHH:mm` and `YYYY-MM-DDTHH:mm:ss`. Start must be in the future, end must follow start, and the licence must cover the entire half-open `[start, end)` interval. No duration, travel buffer or timezone is guessed. Adjacent reservations are permitted; operational travel/buffer policy requires a separately agreed rule.

Only active `delivery_personnel` users in the manager's active assigned area, with global availability `available` and a valid licence, are offered and accepted. Personnel already reserved on overlapping `pending` or `assigned` deliveries are unavailable. An unresolved `in_transit` delivery blocks that driver even after its planned end. Availability is advisory on GET and rechecked under locks on POST. Future reservations do not set the driver's global flag to `busy`.

Vehicle eligibility requires a non-retired vehicle whose custodian belongs to the manager's active area, without maintenance, unknown in-use state, overlapping active reservation or unresolved in-transit delivery. Managers share their area's fleet. Adjacent vehicle reservations are permitted. GET eligibility is advisory; every criterion is rechecked under locks on POST.

Each mutation uses one transaction (or a savepoint inside a caller's transaction): lock the shared active **area first**, then revalidate/lock its manager, lock the delivery, check `expected_version`, lock affected personnel user rows in ID order, validate personnel, lock old/new vehicles in ID order and perform current locking reads for conflicts. Shared area locks serialize different managers and fleet edits. Locking manager rows before the area could deadlock when selecting another manager's vehicle; concurrency testing exposed this and the lock order was corrected. Successful changes increment the version and persist resource state, audit and notifications atomically. Notification failure rolls everything back. Deadlock/lock-timeout errors return a generic retryable 409 through the delivery controller.

| Operation | Allowed current state | Result |
| --- | --- | --- |
| Reserve, reassign or reschedule personnel | `pending`, `assigned` | `pending`; vehicle confirmation still required |
| Reserve/reassign/reschedule with eligible personnel and vehicle | `pending`, `assigned` | `assigned`; both resources reserved atomically |
| Repeat identical reservation with current version | Editable state | No change, version increment or duplicate notification |
| Cancel delivery | `pending`, `assigned` | `cancelled`; audit/notification persisted |
| Repeat cancellation with current version | `cancelled` | No change or duplicate notification |
| Start delivery | `assigned`, during its reserved window | `in_transit`; resources revalidated |
| Complete actual delivery | `in_transit` | `delivered`; resources released when no other hold remains |
| Repeat a start/completion with current version | Same target state | No duplicate action or notification |
| Reassign/cancel in-transit or delivered deliveries; reserve cancelled deliveries | Disallowed | 409 |
| Any stale version | Disallowed | 409; refresh before retrying |

Cancellation/completion retain resource IDs, addresses and schedule as history; terminal status releases personnel and vehicle time. Vehicle reassignment releases the old hold. A vehicle is `in_use` while any `pending`/`assigned`/`in_transit` delivery references it, and returns to `available` after its last hold ends. `in_use` means reserved/on delivery, not necessarily physically moving now: a known reservation does not block non-overlapping future windows. Maintenance/retirement state is not overwritten during release. An unfinished in-transit delivery blocks further reservations even after its planned end. There is no automatic clock-driven completion or release.

Omitting `vehicle_id` or sending `null` deliberately performs personnel-only reservation: it clears the current vehicle hold and leaves the delivery pending. To retain a vehicle while rescheduling or reassigning personnel, explicitly select and send it again for validation. The UI preselects the existing vehicle only when it remains eligible. Even identical legacy rows are promoted to Assigned only after both resources have been validated.

Fleet edits/retirement/restoration reject active reservations, including inconsistent legacy rows whose flag still says available. Fleet mutations use the same area-first lock order. Starting requires both resources, an active eligible driver, an eligible vehicle and the current reserved window. Completion can resolve an overdue real in-transit delivery. No paid-rental event is simulated by these explicit logistics transitions.

Vehicle payload capacity and personnel licence class are displayed; vehicle dimensions are available in the eligibility API. Automatic load fit and vehicle-class/licence compatibility are not claimed: deliveries lack authoritative cargo requirements and there is no agreed class-mapping policy. Operators must review physical suitability until those contracts exist. No travel buffer, payment or agreement workflow has been invented.

Notifications use type `delivery`: new personnel receive resource/schedule details, including the selected vehicle ID; previous personnel receive reassignment removal; vehicle changes, cancellation, start and completion notify the affected personnel. They appear through the existing shared popup and unread/read APIs. No email is dispatched by assignment code.

## API

Paths below are relative to `/backend/api`. Session authentication and the `area_manager` role are required, and active account/area are revalidated on every request.

| Method | Path | Input |
| --- | --- | --- |
| GET | `/area-manager/deliveries` | Existing `page`, `per_page`, `status` filters |
| GET | `/area-manager/deliveries/{id}/available-personnel` | `scheduled_at`, `scheduled_end_at` query parameters |
| GET | `/area-manager/deliveries/{id}/available-vehicles` | `scheduled_at`, `scheduled_end_at` query parameters |
| POST | `/area-manager/deliveries/{id}/assign` | `delivery_personnel_id`, optional `vehicle_id`, `scheduled_at`, `scheduled_end_at`, `expected_version` |
| POST | `/area-manager/deliveries/{id}/cancel` | `expected_version`, non-empty `reason` (up to 500 characters) |
| POST | `/area-manager/deliveries/{id}/status` | `expected_version`, `status`: `in_transit` or `delivered` |

Assignment and reassignment use the same POST. The listing includes personnel ID/name, vehicle ID/plate/type, end time and version, plus top-level `assignment_supported`. Successful mutations return `{changed, delivery}` inside the normal success envelope. IDs/version must be integers; booleans, arrays, floats, negative values and oversized identifiers are rejected. Unknown mutation fields are rejected. Personnel availability exposes safe identity/licence fields; vehicle availability exposes ID, plate, type and dimensions/capacity, without owner or credential details.

Example synthetic assignment body:

```json
{
  "delivery_personnel_id": 6,
  "vehicle_id": 1,
  "scheduled_at": "2030-01-01T10:00",
  "scheduled_end_at": "2030-01-01T11:00",
  "expected_version": 0
}
```

Use IDs and the version from the actual test listing rather than assuming this example matches a future fixture. Errors: 401 missing/revoked identity, 403 wrong role/inactive account, 404 outside-area or missing resource, 409 state/schedule conflict/stale version/unavailable schema or area, 422 invalid fields, 415 non-JSON mutation, 400 malformed JSON. Unexpected storage errors retain the existing generic 500 response.

## Frontend

`frontend/Area Manager/Delivery Assignments/` retains the navy/green/white cards and displays personnel and vehicle details, reserve/reassign/reschedule/cancel controls and valid start/complete actions. The existing native dialog supplies accessible labels, keyboard focus containment, Escape handling and focus restoration. Availability loads both real endpoints; time changes invalidate both selectors. An empty fleet permits personnel-only reservation, but the UI never claims it is fully assigned. Review/confirmation includes the chosen vehicle; errors and stale versions remain visible. Successful saves reload the real listing while preserving filters/page.

All new data is inserted using text nodes; no API content is inserted as HTML. New CSS is scoped to `.delivery-page` and `.delivery-assignment-dialog`. Visibility/session changes close and remove the dialog, clear private content, and invalidate delayed responses. No mock production API or assignment state is used.

## Fresh verification results

Environment: PHP 8.2.12 and MariaDB 10.4.32 from `C:/xampp1`. All DB tests used loopback port **13307**, with a temporary datadir under this repository's ignored `tmp/` directory. Week 4 fixture creation verifies the port, temporary datadir and non-production environment before creating a unique database. No real rental/payment/agreement events were fabricated. Mail sending is forced off for the isolated HTTP router and application suites.

| Suite | Fresh result |
| --- | --- |
| Week 4 backend/controller/security | **89 passed** |
| Week 4 vehicle backend/lifecycle/security | **41 passed** |
| Week 4 real HTTP/session/role validation | **162 passed** |
| Week 4 vehicle HTTP/security | **116 passed** |
| Week 4 actual multi-process InnoDB concurrency | **14 passed**, 22 worker transactions |
| Week 4 live Chrome/frontend | **47 passed**, widths 1440/768/390/320 |
| Public synthetic login production/DB isolation guard | **62 passed**, all seven roles |
| Existing shared notification/delivery frontend | **63 passed** |
| Week 3 backend | **129 passed** |
| Week 3 HTTP | **88 passed** |
| Week 1 fresh migration + schema-only upgrade | **34 ordered migrations passed** |
| Week 1 integration/security | **50 passed** |
| Complaint policy/upload/database and controller | **132 + 39 passed** |
| Week 1 Apache/API/security | **66 passed** |
| Area/registration/vehicle scoping HTTP | **168 + 116 passed** |
| Admin/complaint session and sanction verification | **781 passed** (includes 664 complaint-security assertions; do not add twice) |
| All four email template formatting/validation | **55 passed**, offline |
| Configurable mail fallback | **8 passed**, real sending disabled |
| Native XAMPP sendmail regression | **62 passed**, loopback-only SMTP sink, no Internet delivery |
| PHP syntax | **102 files passed** |
| JavaScript syntax | **66 files passed** |
| Git whitespace checks | Passed |
| Existing messaging route/model/discovery/concurrency suites | **BLOCKED/failed to run to completion**: SQLSTATE 42S02, missing `conversation_participants` (and no committed messaging table migrations) |

Concurrency checks cover competing same-area managers booking overlapping personnel or vehicles, adjacent windows, stale competing resource edits, cancellation versus assignment, and maintenance/retirement versus assignment. The area-first fix passed three fresh-database concurrency runs before the expanded fleet-race suite. Backend tests include nested transactions, rollback of both vehicle states on notification failure, legacy unknown windows, unfinished/overdue in-transit work, expiry across midnight, release of the last hold, invalid transitions and field injection. Browser checks use the real API to verify personnel-only and combined assignments, vehicle reassignment/rescheduling/release, start/completion, confirmations, empty/loading/offline availability, persisted state, stale conflicts, pagination/filters and keyboard/session behavior.

The Week 1 HTTP retirement test was updated to first assert 409 for a pending delivery, then set that isolated fixture to terminal history and assert successful retirement. This preserves historical retirement coverage without allowing an actively reserved vehicle to disappear.

The fixture-login verifier must run without concurrent browser logins: it snapshots user rows to prove failed production logins do not update them. A combined parallel run detected the browser's legitimate login timestamp update; the verifier was rerun alone and all 62 checks passed. `run_week4.ps1` now runs that verifier before browser work.

Current vehicle-phase evidence is in ignored `tmp/week4-vehicle-final-results.log`, `tmp/week4-vehicle-browser-results.log`, `tmp/week4-vehicle-week1-results.log`, `tmp/week4-vehicle-week3-results.log`, `tmp/week4-vehicle-area-results.log`, `tmp/week4-vehicle-legacy-http-results.log` and `tmp/week4-vehicle-smtp-results.log`. Final browser screenshots/results are under `tmp/week4-browser-1795846092104/`; desktop/mobile layouts were inspected. Prior personnel-checkpoint evidence remains under its original names. Local test databases, logs, mail, browser profiles and sessions remain excluded by the existing ignore rules.

### Repeat the tests safely

Use the already verified isolated MariaDB instance on 13307. If absent, follow the isolated bootstrap in `docs/week-3.md`, substituting the actual `C:/xampp1` installation. Never point these tests at 3306. No test runner starts, stops or reconfigures the normal XAMPP database.

```powershell
& backend/tests/run_week4.ps1 -XamppRoot C:/xampp1 -KeepServer
```

The runner creates fresh schema/fixtures, applies the extension, runs backend/concurrency/HTTP/fixture-login safety checks, and optionally retains the loopback server on 18086. It refuses an occupied port and does not stop an existing service. Close only a previously verified test server before rerunning. Without `-KeepServer`, its own server is stopped after the checks. `tmp/week4-fixture.json` is test output; `tmp/week4-active.json` describes the retained HTTP server, so a backend-only test cannot change the manual server metadata.

To repeat live browser tests after a fresh fixture, start a disposable Chrome profile (keep its directory under ignored `tmp/`):

```powershell
$profile = Join-Path (Get-Location) ('tmp/week4-chrome-' + [guid]::NewGuid().ToString('N'))
Start-Process 'C:/Program Files/Google/Chrome/Application/chrome.exe' -WindowStyle Hidden -ArgumentList @('--headless=new', '--no-first-run', '--remote-debugging-port=19223', ('--user-data-dir="' + $profile + '"'), 'about:blank')
# Wait for http://127.0.0.1:19223/json to respond, then:
node backend/tests/week4_frontend_test.js
```

Use a free debugging port and a new profile; do not attach to a personal Chrome session. The browser test uses port 19223 and consumes fresh synthetic records. Run it after the fixture-login verifier, not concurrently. Supporting commands:

```powershell
$env:EQUIPIFY_DB_PORT = '13307'
$env:EQUIPIFY_MAIL_ENABLE_SEND = '0'
node backend/tests/notifications_frontend_test.js
& C:/xampp1/php/php.exe backend/tests/email_format_test.php
& C:/xampp1/php/php.exe backend/tests/mailer_test.php
# Native test runs a local sink; it never targets Gmail or another Internet server.
node backend/tests/sendmail_smtp_test.js
$env:EQUIPIFY_TEST_SOURCE_DB = '<explicit equipify_week3_test_... fixture name>'
& backend/tests/run_week1.ps1 -XamppRoot C:/xampp1
& backend/tests/run_areas.ps1 -XamppRoot C:/xampp1
```

## Manual browser verification

The retained Week 4 server serves this Git working copy at `C:/Users/Cyborg/Downloads/New folder/equipify`, on **http://127.0.0.1:18086**. Its database is `equipify_week4_test_20261128_060726_91ab1717`, on 13307. Check the `X-Equipify-Test-Database` response header against `tmp/week4-active.json` before testing. Port 18083 remains the separate Week 3 fixture server. Normal XAMPP Apache has document root `C:/xampp1/htdocs`; its independent `equipify` project copy is not this working copy and was not updated.

| Purpose | Exact URL | Synthetic email |
| --- | --- | --- |
| Area Manager login | http://127.0.0.1:18086/frontend/Area%20Manager/Login/index.html | `area_manager@week4.test` |
| Delivery Assignments | http://127.0.0.1:18086/frontend/Area%20Manager/Delivery%20Assignments/index.html | Log in first |
| Delivery Personnel login | http://127.0.0.1:18086/frontend/Delivery%20Personnel/Login/index.html | `delivery_personnel@week4.test` or `driver_two@week4.test` |
| Delivery Personnel dashboard/bell | http://127.0.0.1:18086/frontend/Delivery%20Personnel/Dashboard/index.html | Log in first |

All these synthetic accounts use **`Week4-Test-Only!42`**. They are fixture-only `.test` identities; login rejects them in production mode and outside a matching `equipify_week4_test_...` database, even if rows were accidentally copied elsewhere. Do not create these accounts in the real database. Use separate browser profiles for manager/personnel so logging in as one role does not replace another role's session. Cookies are shared across localhost ports; separate profiles also avoid interfering with Week 3 sessions.

1. Log in as the manager and open Delivery Assignments. Existing synthetic pending deliveries are available with real pagination.
2. Choose a pending delivery, click **Reserve resources**, enter **1 January 2030, 10:00–11:00 (Sri Lanka)**, check availability and choose personnel. Keep **No vehicle** to verify Pending, or select `W4-VAN-1`/`W4-VAN-2` to verify Assigned. Review and confirm.
3. Try another delivery with the same person or vehicle/window: it must be unavailable or return 409. An adjacent 11:00–12:00 window is permitted. Maintenance, retired, foreign-area and orphaned in-use vehicles must not appear.
4. Use **Reassign / reschedule** to change either resource or the explicit schedule. The vehicle must be selected again for revalidation. Choosing no vehicle releases the old hold and returns Pending. Both old/new personnel receive appropriate notifications.
5. Open the same delivery in two manager tabs. Save one and try the old form in the other: expect a conflict and refresh guidance.
6. Cancel with a reason and confirm. Verify the cancelled badge, retained history and release of both resources for that window. A vehicle with other reservations must remain in_use globally, while being bookable in a free window. Verify filters/pagination and responsive keyboard behavior.
7. In the personnel profile, inspect the shared bell, unread count, mark-as-read and reload persistence. No real email should be sent.

8. To verify start/completion manually, reserve both resources for a window starting a few minutes ahead, wait for the start and click **Start delivery**. Early starts must return 409. Use **Complete delivery** only after the actual synthetic test activity is finished; verify Delivered and resource release. Reassignment/cancellation during transit must be rejected. No SQL edits or rental/payment events are needed for this manual path.

Some fixtures are already cancelled, delivered or reserved by regression tests; choose a remaining pending record and a free future interval. Tests use dates in 2090–2098; 2030 is separate and within fixture licence validity. A deliberately incomplete legacy in-transit fixture remains for security regression and cannot be finalized without resolving its missing resources. The automated valid lifecycle fixture was completed by browser tests.

## Teammate dependencies and safe integration plan

Read-only inspection of existing local remote-tracking refs found `origin/dev` at `3baa197`, `origin/week-1-pasindu` at `5c24822`, and `origin/feature/week-1-trimasha` at `b63a1ae`. These are local snapshots, not a claim about newly published remote work. No branch was fetched, pulled or merged.

- Pasindu has rental/rental-status schema numbered 032/033 and wishlists 031; these conflict numerically with local complaint actions/notifications/complaints.
- Trimasha has equipment blackouts 029, maintenance requests 030, maintenance photos 034 and rental agreements 035; these conflict numerically with local areas/personnel-area changes/login attempts/deliveries. Its 036–040 lifecycle tables also need a reviewed dependency order.
- The teammate rental/agreement schemas are not integrated into this working branch. No authoritative payment persistence/event contract or safe paid-rental delivery-creation path is available here. Those remote files alone do not establish the complete runtime dependency chain.
- No committed migration in this checkout creates `conversations`, `conversation_participants` or `messages`; this prevents claiming a complete messaging regression pass on a fresh schema. No substitute production messaging schema was invented.

Before group integration, agree a single migration ledger/order with owners; reconcile the existing 029–035 collisions without renaming migrations already applied elsewhere blindly. Review rental/payment/agreement identity and status contracts and their event idempotency before enabling delivery creation. Apply reconciled schemas and the existing namespaced extension to a new integration database and run every suite again. Vehicle reservation and logistics transitions are now implemented; they do not prove the missing paid-rental integration. Keep the production database untouched until that review and explicit deployment approval.

Resource release and explicit delivery start/finish are tested. Travel buffers, automatic cargo suitability and vehicle/licence compatibility remain policy/data dependencies. Live Gmail delivery retains its independently documented Week 3 configuration/provider blockers; SMTP and file fallback were preserved.

## Changed files and preservation

Week 4 production changes: `backend/models/DeliveryModel.php`, `backend/controllers/DeliveryController.php`, `backend/controllers/NotificationController.php`, `backend/controllers/AuthController.php`, `backend/routes.php`, the three files under `frontend/Area Manager/Delivery Assignments/`, and the namespaced schema extension.

Week 4 verification/documentation: this file; `backend/tests/run_week4.ps1`; `week4_fixture.php`; `week4_test.php`; `week4_http_test.php`; `week4_assignment_worker.php`; `week4_concurrency_test.js`; `week4_frontend_test.js`; plus narrow extensions to `fixture_login_security_test.php` and `isolated_router.php`.

Vehicle-phase changes extend `DeliveryModel.php`, `DeliveryController.php`, `AreaManagerModel.php`, `VehicleModel.php`, `routes.php`, the delivery page's `script.js`/`index.html`, existing Week 4 fixture/runner/worker/concurrency/browser tests, `week1_http_test.php` and this document. New files are `backend/tests/week4_vehicle_test.php` and `backend/tests/week4_vehicle_http_test.php`. No vehicle-phase migration, SMTP/configuration or unrelated dashboard styling was added.

All 14 pre-existing uncommitted SMTP-related paths were retained. Thirteen remain byte-for-byte unchanged from the initial snapshot; the existing test router additionally accepts the Week 4 prefix and separates Week 4 sessions by database, while retaining its SMTP send-disable protection. Mailer, SendmailTransport, SMTP tooling/tests/config example and `docs/week-3.md` were not overwritten. No credentials, local mail, sessions, test databases or logs were staged. Nothing was committed or pushed.
