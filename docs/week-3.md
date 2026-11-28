# Week 3 audit, implementation and verification

## Gmail setup clarification (28 November 2026)

Provider settings are now specified as Gmail, `smtp.gmail.com:587`, STARTTLS (`EQUIPIFY_SMTP_SECURITY=tls`). Approval covers at most four synthetic messages to the same test Gmail account, but the supplied sender/recipient is still a placeholder, not a confirmed actual address. No email has been sent to it or to any Equipify user. Enter the actual address only in local environment; confirm it explicitly before any agent performs sending.

Create a separate `Equipify XAMPP Test` App Password through [Google App Passwords](https://myaccount.google.com/apppasswords) after enabling 2-Step Verification. Account policy can restrict availability; see [Google's App Password guidance](https://support.google.com/accounts/answer/185833?hl=en). Use the generated credential locally, never the ordinary Google password or a value pasted into Git/chat.

In a PowerShell terminal at this repository:

```powershell
$ErrorActionPreference = 'Stop'
$testGmail = (Read-Host 'Actual approved test Gmail address (sender and recipient)').Trim()
if ($testGmail -eq 'YOUR_TEST_GMAIL@gmail.com') { throw 'Replace the placeholder with the actual approved address.' }
$env:EQUIPIFY_SMTP_HOST = 'smtp.gmail.com'
$env:EQUIPIFY_SMTP_PORT = '587'
$env:EQUIPIFY_SMTP_SECURITY = 'tls'
$env:EQUIPIFY_SMTP_USERNAME = $testGmail
$env:EQUIPIFY_MAIL_FROM = $testGmail
$env:EQUIPIFY_MAIL_FROM_NAME = 'Equipify'
$env:EQUIPIFY_MAIL_TEST_RECIPIENT = $testGmail
$gmailAppSecret = Read-Host 'Google App Password' -AsSecureString
$gmailSecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($gmailAppSecret)
try {
    $env:EQUIPIFY_SMTP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($gmailSecretPointer).Replace(' ', '')
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($gmailSecretPointer)
}
Remove-Item Env:EQUIPIFY_SENDMAIL_EXE -ErrorAction SilentlyContinue
try {
    & ./backend/tools/configure_sendmail.ps1 -XamppRoot 'C:/xampp1' `
        -SendmailDirectory 'C:/YourReviewedSendmailBundle'
} finally {
    Remove-Item Env:EQUIPIFY_SMTP_PASSWORD -ErrorAction SilentlyContinue
}
# Stop if setup fails; do not proceed without the newly configured profile.
$env:EQUIPIFY_MAIL_TRANSPORT = 'sendmail'
$env:EQUIPIFY_MAIL_ENABLE_SEND = '1'
$env:EQUIPIFY_MAIL_FALLBACK = 'file'
$env:EQUIPIFY_MAIL_TIMEOUT = '15'
$env:EQUIPIFY_MAIL_DIRECTORY = Join-Path (Split-Path $env:EQUIPIFY_SENDMAIL_EXE -Parent) 'fallback'
```

Replace the bundle path with the reviewed TLS-capable folder containing sendmail.exe and its DLLs, outside Git. The installed 0.9.8o bundle is still blocked; neither credentials nor TLS verification have been supplied to override that outstanding compatibility work. The [maintainer-linked TLS 1.2 repository](https://github.com/sendmail-tls1-2/main) contains `Sendmail_v33_TLS1_2.zip`, but that unmaintained fork is not a production security endorsement. Do not disable STARTTLS to make the old bundle connect.

After successful local setup, `test_email.php --preview` saves four local previews. Running `C:/xampp1/php/php.exe backend/tools/test_email.php --send-approved-test` once sends at most four synthetic messages only to the environment's approved recipient and temporarily disables fallback to prevent a saved file being counted as SMTP delivery. Keep application fallback configured to `file`; the verifier restores it afterward. Check the approved inbox/spam for all four subjects and do not retry blindly after a timeout. No database connection or event simulation is involved. Gmail's endpoint/STARTTLS mapping is documented in [Google's SMTP guide](https://developers.google.com/workspace/gmail/imap/imap-smtp).

## SMTP/sendmail implementation and verification (28 November 2026)

**Email transport/configuration tooling is implemented and tested. Live provider configuration and actual inbox delivery are NOT yet verified.** The Gmail clarification above records approval for at most four synthetic messages to one test account; its actual address and local SMTP credentials are still missing. No SMTP credentials are configured in the current process or user environment, and no Internet email was sent. The existing `C:/xampp1` sendmail bundle uses OpenSSL **0.9.8o**, so the setup tool refuses to configure it for live TLS; a reviewed provider-compatible bundle is also required. These are outstanding environment dependencies, not passing delivery tests.

### Existing implementation extended

- Kept `Mailer::send(string $to, string $subject, string $html): bool`, all four `EmailTemplates::render()` templates and the configurable file fallback. No rental, payment, agreement, OTP persistence, scheduler or new email HTTP endpoint was introduced.
- Added RFC-style Date/UTF-8 MIME headers, folded encoded subjects, quoted-printable HTML, control-character/UTF-8 validation and empty-message validation. This preserves multilingual HTML through the native Windows client rather than sending unencoded 8-bit data.
- Added `SendmailTransport.php` for the explicitly configured `EQUIPIFY_SENDMAIL_EXE` profile: argument-array execution without a shell, fixed `-t`, bounded timeout, checked native exit status, discarded native stdout/stderr and cleanup of transient input. The input file is created inside the profile's ACL-protected directory and removed in `finally`. Neither message bodies, OTPs, addresses nor native SMTP diagnostics are logged by this transport.
- An unavailable/disabled/rejected/timed-out send uses a file only if `EQUIPIFY_MAIL_FALLBACK=file`; invalid input is rejected before any file/native transport. A failed file write returns false. True can mean transport acceptance OR saved file; it never proves inbox receipt. The approved-recipient CLI verifier disables fallback, so its success cannot silently mean a saved file.
- Kept the pre-existing PHP `mail()`/`sendmail_path` compatibility route when no native executable is configured. Use the new explicit native profile for checked exit status, timeout and diagnostic isolation; the legacy compatibility route does not gain those guarantees.
- Added environment-driven Windows setup, a public empty-credential environment example, a preview/approved-recipient CLI verifier and offline/native transport tests. Generated `sendmail.ini` files are ignored as an additional safeguard.
- Updated test isolation: the isolated PHP router and Apache regression runners force `EQUIPIFY_MAIL_ENABLE_SEND=0`, and the runners restore the caller's original flag. Disabling PHP's `mail()` alone does not disable an explicitly configured native executable. The original mail fallback subprocess test clears any inherited native profile.

### Fresh test results

| Verification | Result |
|---|---|
| `email_format_test.php` | PASS, **55** offline formatting, Unicode/MIME round-trip, injection/invalid input, required template field and output-failure checks |
| `mailer_test.php` | PASS, **8** isolated compatibility/fallback subprocess cases; real mail disabled and native profile cleared |
| `sendmail_smtp_test.js` | PASS, **62** checks through the actual XAMPP sendmail executable to a loopback-only SMTP sink: all four subjects and OTP/reference payloads, escaped HTML, multilingual body/subject, credentials with INI punctuation, paths with spaces, rejection, missing executable, timeout, fallback, cleanup, disabled-send behavior and unsafe configuration rejection |
| Legacy TLS guard | PASS: bundled OpenSSL 0.9.8 profile rejected before live profile creation |
| `week3_test.php` | PASS, **129** checks on new `equipify_week3_test_20261128_043329_124548f1`, separate MariaDB port 13307 |
| Existing frontend regression | PASS, **63** checks |
| Area/Apache regression | PASS, model checks and **284** HTTP assertions on new `equipify_areas_test_20261128_043906_e3a5d4af` at 13307; runner restored its caller's mail-enable flag |
| Syntax | All **96 PHP** files passed; new native test JavaScript and setup PowerShell parsed successfully |
| Approved live-send guard | Refused with no approved recipient; no mail sent |

The loopback sink performs actual local SMTP/authentication but does not forward mail, contact an Internet SMTP provider or prove TLS/inbox delivery. Automated tests use only synthetic addresses/credentials. Native profile test credentials are outside the repository and their generated INI is removed after the suite. Preview/fallback outputs remain ignored under `tmp`. The real `equipify` database, normal Apache/MySQL services, `C:/xampp1/php/php.ini` and original `C:/xampp1/sendmail/sendmail.ini` are unchanged.

### Windows setup: environment credentials, private native profile

The native client reads literal settings from an INI beside its executable; it does **not** expand `$ENV` placeholders in that INI. The setup script therefore takes credentials from process environment and materializes them only in a newly created, ACL-protected native profile outside the repository/web root. This private INI necessarily contains the credential locally; it must never be copied into Git or served. Existing profiles are never overwritten. See the [sendmail author's source](https://www.glob.com.au/sendmail/source.html) and [PHP mail configuration](https://www.php.net/manual/en/mail.configuration.php).

1. Use the current repository on `feature/admin-ui-updates`. Confirm the CLI PHP installation with `C:/xampp1/php/php.exe --ini`. The actual installation here is `C:/xampp1`; do not configure the older `C:/xampp` copy or assume normal Apache serves this working tree.
2. Obtain your provider's SMTP host, port, TLS mode, SMTP username/app-password or SMTP credential, and an authorized From address. The bundled legacy OpenSSL 0.9.8 build cannot satisfy modern TLS 1.2 requirements. Select a reviewed compatible native bundle without overwriting the working XAMPP installation, and pass its directory as `-SendmailDirectory`. The original author's [TLS 1.2 pointer](https://www.glob.com.au/sendmail/) and linked [replacement's documentation](https://github.com/sendmail-tls1-2/main) explain this compatibility issue; neither a download nor provider TLS/certificate behavior was verified by this task. Do not disable encryption to work around it.
3. In a private PowerShell terminal, set the following **process** variables. Use your provider's exact settings; no provider values are guessed:

```powershell
$env:EQUIPIFY_SMTP_HOST = Read-Host 'SMTP host'
$env:EQUIPIFY_SMTP_PORT = Read-Host 'SMTP port (provider-specified)'
$env:EQUIPIFY_SMTP_SECURITY = Read-Host 'tls for STARTTLS, or ssl for implicit TLS'
$env:EQUIPIFY_SMTP_USERNAME = Read-Host 'SMTP username'
$env:EQUIPIFY_MAIL_FROM = Read-Host 'Provider-authorized sender email'
$env:EQUIPIFY_MAIL_FROM_NAME = 'Equipify'
$smtpSecret = Read-Host 'SMTP app-password/credential' -AsSecureString
$smtpPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($smtpSecret)
try {
    $env:EQUIPIFY_SMTP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($smtpPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($smtpPointer)
}
```

Do not paste a real password into chat, a source file or a PowerShell command literal. The native INI setup requires printable ASCII settings without surrounding whitespace; message names/subjects/bodies support UTF-8. `backend/config/.env.example` documents the variables but is not automatically loaded by PHP.

4. Run the setup script **in the same PowerShell process**. Replace only the bundle path with the reviewed compatible directory:

```powershell
& ./backend/tools/configure_sendmail.ps1 -XamppRoot 'C:/xampp1' `
    -SendmailDirectory 'C:/YourReviewedSendmailBundle'
# Optional: -ServiceAccount 'DOMAIN\ApacheAccount' if Apache runs as another identity.
```

It creates a new profile under `LOCALAPPDATA/Equipify/sendmail-<unique-id>`, removes inherited ACL entries, grants access to the current user/SYSTEM and any explicitly named service account, copies only the executable/DLLs, disables native debug/error logs, clears forced recipients, and sets `EQUIPIFY_SENDMAIL_EXE` in that PowerShell process. It refuses repository/web-root destinations, existing profiles, INI/control-character injection, and unencrypted non-test settings. `-AllowLoopbackTest` permits plaintext only for 127.0.0.1 on an unprivileged port and is for the automated sink only.

5. Set runtime options. File fallback remains optional and private:

```powershell
$env:EQUIPIFY_MAIL_TRANSPORT = 'sendmail'
$env:EQUIPIFY_MAIL_ENABLE_SEND = '1'
$env:EQUIPIFY_MAIL_FALLBACK = 'file'  # omit/set empty to return false instead
$env:EQUIPIFY_MAIL_TIMEOUT = '15'     # native profile: 1–60 seconds
$env:EQUIPIFY_MAIL_DIRECTORY = Join-Path (Split-Path $env:EQUIPIFY_SENDMAIL_EXE -Parent) 'fallback'
Remove-Item Env:EQUIPIFY_SMTP_PASSWORD
# The native process reads its protected INI, so the setup secret need not remain in environment.
```

Do not permanently store the password in user/machine environment or commit an env file. Rotate by creating a fresh profile from new credentials, switching the executable setting, restarting only the intended process, and securely retiring the old private profile after it is unused.

6. The new checked native route does not need a global `php.ini` edit. For compatibility with another caller using PHP `mail()`, set `sendmail_path` to the quoted private executable plus `-t` in the **active** PHP INI, keep `mail.log` empty and `mail.add_x_header` off, then restart only the intended Apache/PHP process. For example, with a space-free private path:

```ini
[mail function]
sendmail_path = "C:/EquipifyPrivate/sendmail-profile/sendmail.exe -t"
mail.log =
mail.add_x_header = Off
```

For this project's checked route, keep `EQUIPIFY_SENDMAIL_EXE` set to the actual generated path and launch PHP/Apache from the environment that contains the runtime options. A Windows service does not inherit variables set later in an unrelated terminal; provision its environment/account explicitly. Do not launch another normal Apache over ports 80/443 or change the real database while testing. The SMTP CLI verifier below needs no web server and no database.

### Four-template preview and approved inbox verification

Offline preview is safe without provider credentials:

```powershell
C:/xampp1/php/php.exe backend/tools/test_email.php --preview
C:/xampp1/php/php.exe backend/tests/email_format_test.php
C:/xampp1/php/php.exe backend/tests/mailer_test.php
node backend/tests/sendmail_smtp_test.js
```

Only after the account owner explicitly approves a recipient for up to four synthetic messages:

```powershell
$env:EQUIPIFY_MAIL_TEST_RECIPIENT = Read-Host 'Explicitly approved test recipient'
C:/xampp1/php/php.exe backend/tools/test_email.php --send-approved-test
```

The live verifier requires explicit sending flags and a configured native executable, disables file fallback for this invocation, labels all four subjects `[Equipify SMTP test]`, and sends only synthetic OTP/reference content with an explicit no-business-event note. It stops at the first failure and prints no address, password, OTP or body. A timeout may occur after remote acceptance, so inspect the inbox before retrying.

Transport acceptance is **not** receipt; see the [PHP mail return-value contract](https://www.php.net/manual/en/function.mail.php). Have the approved inbox owner confirm receipt of all four messages (including spam/quarantine), correct subjects, readable Unicode/HTML and the expected synthetic details. Record received/missing results here without copying OTPs or SMTP credentials. **No such receipt confirmation exists yet.** SMTP provider logs can help diagnose authentication/authorization without enabling message transcripts or copying credential-bearing diagnostics into chat/Git.

### Remaining dependencies

Live SMTP configuration/testing needs the approved recipient, provider host/port/security, authorized sender, credentials supplied locally and a compatible TLS bundle. SMTP relay acceptance, inbox delivery and provider TLS behavior remain unverified. The mailer/template work does not establish a working agreement OTP lifecycle or rental/payment/deadline event integration: their owners must supply durable transitions, secure OTP hashes/expiry/attempts and transaction/outbox/idempotency behavior. No fake rental/payment/agreement events were created to claim those dependencies are complete.

Changed for this task: `Mailer.php`, new `SendmailTransport.php`, new setup/verification tools, `backend/config/.env.example`, email tests, native-send isolation in existing test runners/router, the `sendmail.ini` ignore rule and this document. No teammate branches were merged and no commit/push was performed.

## Final pre-commit review (28 November 2026)

**READY to commit a partial Week 3 checkpoint. This is not approval to deploy, merge, push or call Week 3 complete.** No staging, commit, merge, reset or push was performed. The real database was not accessed or modified.

### Inventory, intent and teammate preservation

Reviewed the original **75 files: 63 modified tracked files and 12 untracked files**, including the complete untracked implementations/tests/documentation. The final candidate set is **80 files** after five additional hardening paths: `.gitignore`, `.htaccess`, `backend/controllers/AuthController.php`, `backend/tests/week1_http_test.php`, and new `backend/tests/fixture_login_security_test.php`. Other fixes extend files already in the original set.

- Exactly 43 HTML changes outside Delivery Assignments add only the shared notification script include. Their existing page content and script includes are retained.
- Delivery HTML/JavaScript/CSS intentionally replace static cards, fake client-side assignment/reassignment and unused form styling with the authorized real-API, read-only list. This removes no persisted teammate assignment workflow.
- The freelancer controller intentionally replaces generated notifications and mock read handlers with the persisted controller aliases, adds active-role checks and preserves other dashboard/job/payment placeholder behavior. Real job-offer/bid handlers, messaging controllers/models, vehicle/maintenance/personnel functionality and existing schema files are unchanged.
- Shared API/list changes add session invalidation and opt-in protected-list behavior. The seven-role routes, recipient filtering, area filtering and real APIs remain intact. No files or migrations were deleted, and no teammate branch was merged. Existing remote migration/controller/Mailer reconciliation remains documented below.

### Secret, configuration and artifact checks

- A complete candidate-file scan and manual classification found **no live passwords, API keys, provider tokens, private keys or non-default database credentials**. Matches were the public synthetic fixture passwords, an existing dummy bcrypt hash used for unknown-user timing, and a negative URL-validation fixture containing placeholder credentials. No SMTP credentials are committed.
- `db_config.php` is safe for this checkpoint: its runtime diff only adds the server-side `EQUIPIFY_DB_PORT` override alongside the existing database-name override. Defaults remain local XAMPP values; no isolated port/name or private credentials are hard-coded. These defaults are development settings, not a production database configuration.
- Ignore rules now also exclude environment variants such as `.env.production` (keeping example/sample templates eligible), root session directories, `sess_*`, `*.eml` and `*.pid`. Existing `/tmp/`, log, upload and generated encryption-key exclusions remain.
- Actual Git inventory checks found **zero tracked/candidate temporary artifacts** and an empty staging area. At audit time, 56 generated mail files, 219 session files and 1,161 database data files were ignored. SQL migration source files remain eligible; no broad SQL exclusion hides schema work.
- Apache and the isolated router now deny mail/session files and the root sessions directory even if a file is accidentally placed outside `tmp`. Three new Apache regressions verify these HTTP denial paths.

### Synthetic credentials are test-only

Authentication now rejects reserved `@week1.test`, `@week3.test` and `@areas.test` accounts unless the **actual selected database** has the corresponding strict `equipify_<suite>_test_...` name. It also rejects them whenever either `EQUIPIFY_ENV` or `APP_ENV` is `production`/`prod`. This prevents an accidentally imported fixture account from logging into an application database; normal accounts retain the existing login flow, rate limits, password verification and generic error response.

The Week 3 fixture seeder refuses production mode before opening a DB connection. It remains CLI-only and creates a new unique test database without reusing one; no fixture credentials or users are introduced by an application migration or runtime registration bypass.

`fixture_login_security_test.php` passed 62 checks covering all seven roles, explicit production flags, login against a new deliberately mismatched test database, unchanged ordinary-account login, and production seeder refusal before connection. This simulation used only new/explicitly selected test databases on 13307; it did not simulate production by touching `equipify`. Reproduce it immediately after creating a fresh Week 3 fixture, with `EQUIPIFY_DB_NAME` set to the printed name and `EQUIPIFY_DB_PORT=13307`. Repeated failed-login checks intentionally participate in the existing rate limiter, so use a fresh fixture for a new test cycle.

### Fresh final verification

| Check | Result |
|---|---|
| Week 3 backend | PASS, 129 checks on new `equipify_week3_test_20261128_035017_cb9ee079`, port 13307 |
| Week 3 HTTP | PASS, 88 checks through a separate 18084 server; temporary copy changes only target port/config include, retaining assertions and leaving manual 18083 available |
| Fixture-login / production safety | PASS, 62 checks |
| Notification/delivery frontend | PASS, 63 checks |
| Mail fallback | PASS, 8 subprocess cases; real mail disabled |
| Week 1 runner | PASS, 34 fresh migrations and schema clone, 50 integration checks, included complaint suites 132/39, **65 actual Apache HTTP/security checks**, including the three new artifact protections |
| Area runner | PASS, model persistence/uniqueness/status and **284 actual Apache HTTP checks** |
| Syntax | PASS, all **92 PHP** and **63 JavaScript** files |
| Whitespace and artifact inventory | PASS; no staged files or temporary artifacts |

The 92 seven-role notification browser checks and 33 delivery browser checks in the UI sections below were performed earlier in this session with live APIs. Desktop/mobile rendering, keyboard focus/dialog behavior and delivery offline/retry states were verified. Extended browser multi-window/BFCache behavior, assistive-technology QA and authorized real SMTP inbox delivery remain manual work.

### Remaining blockers and commit scope

The checkpoint must retain explicit limitations: paid-rental delivery creation throws for positive IDs; payment callback, agreement OTP lifecycle, rental/payment/deadline events and delivery deduplication are unwired. Four messaging suites remain blocked by schema already missing in HEAD. Migration-number and cross-branch dependency conflicts remain unresolved. These are not newly introduced removals and are not claimed as passing tests.

Commit the source, tests, access protections and documentation together as a **partial notification/email/read-only delivery checkpoint** after normal human diff review. Do not include ignored artifacts or represent this as a completed Week 3 or production release. The original local changes are preserved.

## Area Manager delivery page redesign (28 November 2026)

The read-only Delivery Assignments page now uses scoped navy/green/white cards with separate delivery ID/reference fields, coloured status badges, SVG pickup/drop-off icons, address blocks and a schedule footer. Persisted schedules render a formatted date/time when provided; missing schedules remain explicitly `Not scheduled`. Desktop uses two location columns; mobile stacks them. Pagination has styled Previous/Next controls, page metadata and an accurate result range. Loading, filtered/unfiltered empty, area-access error and network-error/retry states replace bare text.

All existing filters are preserved; In transit, Delivered and Cancelled now expose the other statuses already supported by the real API. Filter buttons use accessible pressed states, reset pagination on change, and keep the current filter on page navigation/refresh. An empty filtered result offers `View all deliveries`. Cards contain no assignment forms, driver/vehicle selection, action simulation or mutation buttons. All delivery network requests remain GETs to `/area-manager/deliveries`; no backend routes, controllers, models, migrations or area authorization were changed.

Session invalidation, hidden-page clearing, stale-response generation checks and BFCache reload behavior are retained. Private addresses and result metadata clear on session/page invalidation. API strings are rendered with `textContent` so references/addresses cannot become HTML. CSS is limited to the delivery page; the existing shell, shared notifications and toast behavior remain intact.

Fresh results for this change:

| Check | Result |
|---|---|
| Notification/delivery frontend regression | PASS, 63 checks; includes identity/reference rendering, status/icons, missing/provided schedules, pagination, filters/pressed states, loading/empty/error/retry, escaped content, GET-only behavior and all prior notification/session/privacy checks |
| Live headless Chrome delivery checks | PASS, 33 checks at 1280x900, 768x1024, 390x844 and 320x568; real manager login/API data, own-area reference isolation, responsive location columns, overflow/touch targets, all filters, empty results, delayed loading, offline failure and real retry recovery; no uncaught JavaScript errors |
| `week3_test.php` | PASS, 129 checks on newly created `equipify_week3_test_20261128_033709_da16abd6`, port 13307 |
| Week 3 HTTP suite | PASS, 88 checks against that same fixture on a separate server on 18084; temporary test copy changes only the target port and config include location, retaining all assertions |
| `run_areas.ps1 -XamppRoot C:/xampp1` | PASS, model persistence/uniqueness/status checks plus 284 actual Apache HTTP assertions (168 base + 116 area-scoping), on `equipify_areas_test_20261128_033913_48432536`, port 13307 |
| Syntax and whitespace | Affected JavaScript checks PASS; all 91 backend PHP files PASS through the area runner; `git diff --check` PASS |

Browser tests served the current repository on 18083 and used existing synthetic manager credentials. They did not reset that manual fixture or create accounts. The live fixture has no scheduled time, so the scheduled-date branch is covered by the DOM regression fixture; the live browser verifies the unscheduled fallback. Desktop/mobile screenshots and logs remain ignored under `tmp/delivery-ui-ce06494271bd459da41480a49d801e37`. Representative desktop, mobile and error screenshots were visually inspected after font loading and responsive transitions completed.

Changed files for this task: `frontend/Area Manager/Delivery Assignments/index.html`, `script.js`, `styles.css`, `backend/tests/notifications_frontend_test.js`, and this document. Existing local changes were extended, not discarded. No real database, normal XAMPP service or configuration was modified; no merge, commit or push was performed.

Manual testing:

1. Sign in using the existing synthetic Area Manager account on port 18083, then hard refresh **http://127.0.0.1:18083/frontend/Area%20Manager/Delivery%20Assignments/index.html**.
2. In the current manual fixture, Week3 A shows SAFE-1 only. Check delivery ID/reference, amber Pending badge, pickup/drop-off blocks and `Not scheduled`. No assignment action should appear.
3. Pending shows the fixture; the other status filters show useful empty states. `View all deliveries` returns to All deliveries. Refresh retains the filter/page. This minimal fixture has one page, so Previous/Next are disabled; multi-page behavior is covered by regression tests.
4. Check at desktop, tablet and 320–390px mobile widths. Tab through filters, Refresh and pagination; verify visible focus and touch target spacing.
5. Throttle the network and refresh to inspect loading; switch offline and refresh to inspect error/retry. Restore connectivity and select `Try again`. Hide/restore the tab or change accounts to verify private delivery content clears.

## Shared notification popup redesign (28 November 2026)

The shared popup now uses a navy/green/white dialog with an SVG bell header, unread-count pill, close control, spaced notification cards, timestamps, green unread highlights/indicators, styled single/all read actions, pagination and loading/empty/error/retry states. The header and pagination stay visible while the list scrolls. Scoped selectors in the new `frontend/shared/notifications.css` prevent changes to unrelated dashboard components. The shared script loads that stylesheet relative to its own URL, so all seven role portals use it without individual HTML edits.

Native modal behavior plus explicit focus handling supports Tab/Shift+Tab containment, Escape, return to the originating bell and an enabled focus target after a completed read action. Quiet background refresh preserves the selected page, list scroll position and focused notification action without taking focus from another control. All notification content remains text, not interpolated HTML. Real list/count/read APIs, 30-second polling, persisted read state, session invalidation, stale-response protection and page lifecycle cleanup are retained.

Fresh checks for this UI change:

| Check | Result |
|---|---|
| `node backend/tests/notifications_frontend_test.js` | PASS, 46 behavioral regression checks, including mark-all, retry/error/empty/loading, timestamps, escaped content, focus, polling, pagination and prior delivery/session regressions |
| Headless Chrome with live APIs on 18083 | PASS, 92 checks across all seven roles at desktop 1280x900, mobile 390x844, compact mobile 320x568 and landscape 844x390; modal bounds/overflow, footer visibility, shared styling, timestamps, mobile touch targets, Tab/Shift+Tab, Escape and focus restoration; no uncaught JavaScript errors |
| `week3_test.php` | PASS, 129 checks on a newly created database on 13307 |
| Week 3 HTTP regression | PASS, 88 checks on `equipify_week3_test_20261128_031933_c0b51686`; a temporary copy changed only the base URL to 18084 and its config include location, retaining all assertions so the manual 18083 server was not interrupted |
| JavaScript syntax and `git diff --check` | PASS |

Desktop and mobile screenshots were captured for all seven roles; representative desktop and mobile images were visually inspected. Browser harness, screenshots and results remain ignored under `tmp/notification-ui-af8b46ad09be47229d59c79471d53644`. The existing manual fixture and read statuses were preserved; browser layout checks did not reset notifications or create accounts. The real database and normal XAMPP configuration were not modified.

Files changed for this UI task only: `frontend/shared/notifications.js`, new `frontend/shared/notifications.css`, `backend/tests/notifications_frontend_test.js`, and this document. Earlier local modifications were retained. No merge, commit or push was performed.

Browser testing on the existing isolated manual server:

1. Hard refresh the relevant protected page on **http://127.0.0.1:18083**, then open its bell. For example: [Customer profile](http://127.0.0.1:18083/frontend/Customer/Profile/index.html), [Admin profile](http://127.0.0.1:18083/frontend/Admin/Profile/index.html), [Area Manager deliveries](http://127.0.0.1:18083/frontend/Area%20Manager/Delivery%20Assignments/index.html), or [Freelancer notifications](http://127.0.0.1:18083/frontend/Freelance%20Worker/Notifications/index.html). The seven-role URL/credential table below still applies.
2. Check the bell/title/count, card spacing/timestamps, green unread state and read buttons at desktop and mobile widths. Existing read notifications remain read; zero counts disable mark-all. The minimal fixtures have only one page, so Previous/Next being disabled is expected; multi-page behavior is covered by regression tests.
3. Mark an unread item read, then mark all read; verify card indicators and both bell/header counts update and remain correct after refresh. Use the existing synthetic fixture accounts only.
4. Tab and Shift+Tab through the dialog, press Escape and verify focus returns to the same bell. Hide/restore the tab and switch accounts in another window to check the retained lifecycle guards. Use network throttling/offline mode to inspect loading and error/retry states, then restore connectivity.

## Fresh verification and integration audit (28 November 2026)

**Environment and integration findings below remain applicable; final test counts and UI/readiness status are superseded by the pre-commit and UI sections above. Week 3 is not complete or ready to push as a completed milestone.** All existing local changes were preserved. No merge, pull, reset, commit or push was performed. No connection was made to the real `equipify` database during testing, and no normal XAMPP service or configuration was changed.

### Environment and working-copy identity

- Active installation: `C:/xampp1`. Running Apache and normal MariaDB executable paths were verified through process inspection. `C:/xampp` also contains tools, but its configured `htdocs` directory is absent; it is not the active installation.
- Normal Apache document root: `C:/xampp1/htdocs`, configured in `C:/xampp1/apache/conf/httpd.conf`. Its project directory is `C:/xampp1/htdocs/equipify`, a separate directory, not a junction to this repository. That copy is on `dev` at `0318a81`.
- Current repository: `C:/Users/Cyborg/Downloads/New folder/equipify`, branch `feature/admin-ui-updates`, HEAD `7e3961b`, plus preserved local changes.
- A static request to `http://127.0.0.1/equipify/frontend/shared/notifications.js` matched the SHA-256 of the Apache copy and differed from this repository. Thus normal localhost serves an older, different copy. No application API on normal localhost was used.
- Available active tools: `C:/xampp1/php/php.exe` (PHP 8.2.12), `C:/xampp1/mysql/bin/mysql.exe`, `C:/xampp1/mysql/bin/mysqld.exe` (MariaDB 10.4.32), `C:/xampp1/mysql/bin/mysql_install_db.exe`, and `C:/xampp1/apache/bin/httpd.exe`.
- Normal Apache ports 80/443 and MySQL port 3306 were left alone. Tests used a newly initialized MariaDB instance bound only to `127.0.0.1:13307`, started with `--no-defaults` and a unique data directory under ignored `tmp/week3-verification-85032834887b411eba348ecc7e5def6c/mysql-data`. `SELECT @@port, @@datadir` verified the instance before suites ran. There was initially no `equipify` database on that instance.
- The earlier connection refusal was an absent isolated server, not a reason to run against port 3306. Bootstrap and start the separate server first. With PowerShell, use the MySQL client's `--host=127.0.0.1 --port=13307` arguments; the abbreviated host argument was misparsed in one diagnostic attempt.

### New fixes in this continuation

1. Area delivery view now clears addresses when hidden, on session invalidation and on page exit. Request-generation checks discard delayed replies; returning to a visible valid view reloads it, and cached-page restoration reloads the page. A new regression first failed against the old script, then passed after the fix. No delivery/payment business logic changed.
2. Both Apache regression runners now judge `httpd -t` by its exit code. Windows PowerShell previously treated Apache's successful `Syntax OK` stderr message as a terminating error.
3. Both runners explicitly keep upload/system temporary files and PHP sessions inside workspace `tmp`, and disable `mail()` in their isolated Apache configuration. Normal PHP/Apache settings are untouched. Use `-XamppRoot C:/xampp1` on this machine. Apache's workspace DocumentRoot check additionally required execution outside the sandbox account; the same generated configuration passed there.

Changed in this continuation: `backend/tests/run_week1.ps1`, `backend/tests/run_areas.ps1`, `frontend/Area Manager/Delivery Assignments/script.js`, `backend/tests/notifications_frontend_test.js`, and this document. Existing modifications in the latter three were extended rather than replaced.

### Fresh automated results

| Suite/check | Result on 28 November |
|---|---|
| `week3_test.php` | PASS, 129 checks; fresh fixtures and 34 migrations excluding 000 |
| `week3_http_test.php` | PASS, 88 checks; latest rerun used isolated PHP on 18084 as described above |
| `notifications_frontend_test.js` | PASS, 63 notification/session/delivery lifecycle checks; separate live-browser results are recorded above |
| `fixture_login_security_test.php` | PASS, 62 fixture isolation / production safety checks |
| `mailer_test.php` | PASS, 8 subprocess fallback cases; real `mail()` disabled |
| `complaints_test.php --database` | PASS, 131 checks on Week 3 fixture; 132 in Week 1 runner |
| `complaints_controller_test.php` | PASS, 39 checks |
| `run_week1.ps1 -XamppRoot C:/xampp1` | PASS: 34 fresh migrations, schema-only clone upgrade, 50 integration/security checks, included complaint suites 132/39, 65 actual Apache HTTP/security checks |
| `run_areas.ps1 -XamppRoot C:/xampp1` | PASS: area model persistence/uniqueness/status checks and 284 actual Apache HTTP checks (168 base + 116 scope) |
| `admin_users_verification_test.php http://127.0.0.1:18081` | PASS, 781 cumulative assertions, including 664 complaint session/account-status checks and 102 suspended/banned request denials; zero failed/blocked within this suite |
| `area_admin_security_test.php <area-test-db> http://127.0.0.1:18085` | PASS, 140 assertions |
| Four messaging suites | BLOCKED/FAILED with exit 255: missing `conversation_participants`; committed migrations also omit `conversations` and `messages` |
| PHP syntax | PASS, all 92 backend PHP files |
| JavaScript syntax | PASS, all 63 JavaScript files under frontend and backend/tests |
| PowerShell runner parsing | Both updated scripts executed successfully |
| `git diff --check` | PASS |

The admin verification suite includes the complaint security and admin sanction suites; its 781 is cumulative, not additional to 664 or 681. Week 1/area HTTP results above really used Apache. Separate admin/complaint security HTTP tests used the isolated PHP router with an exact test-database response marker. No test assertion was removed or weakened. No SMTP call or inbox-delivery claim was made.

Principal databases: `equipify_week3_test_20261128_024755_f9eca6e6`, `equipify_week1_test_20261128_025128_31b9b5`, `equipify_week1_upgrade_20261128_025128_31b9b5`, and `equipify_areas_test_20261128_025210_16b45205`. A fresh, separately created manual fixture is recorded below. Failed runner attempts retained their own uniquely named test databases; none reused an existing database.

Messaging commands attempted: `messages_test.php --existing-data`, `messages_routes_test.php`, `messages_discovery_test.php --existing-data`, and `messages_concurrency_test.php`, all with `EQUIPIFY_DB_PORT=13307` and the Week 1 test database. They stop on missing schema before populated-thread/unread/concurrency verification. Repository-wide SQL search found no authoritative definitions for those three tables. This is a reproducible fresh-install dependency blocker, not a passing or skipped regression. Do not fabricate a reduced schema to get green results; obtain the messaging owner's migrations and fixture strategy.

Logs, test configurations and a pre-change SHA-256 baseline are retained under the ignored verification directory. No secrets or real user data were copied. `tmp/week3-active-verification.json` records only test process IDs, paths and the manual database name.

### Requirement status now

- **Implemented and automatically verified:** persisted notification list, unread count and single/all mark-read for all seven roles; recipient isolation and active-account checks; freelancer aliases/feed and notification-derived dashboard activity; shared bells, pagination and polling/session lifecycle guards; four escaped email templates; disabled/unavailable sendmail file fallback policy; area-manager own-area delivery listing and area authorization. Automated frontend coverage does not establish visual/browser behavior.
- **Available, extended manual verification pending:** actual sendmail/SMTP acceptance and inbox delivery; browser multi-window session changes, BFCache, assistive technology and extended notification network-lifecycle behavior. Desktop/mobile layouts, keyboard/dialog behavior and delivery filters/loading/offline/retry were subsequently verified in the UI sections above.
- **Blocked:** authoritative paid-rental creation, self-pickup/return applicability, rental-linked delivery uniqueness and concurrent callback idempotency, real PayHere callback, agreement OTP lifecycle, rental/payment/deadline event wiring, and fresh-install messaging schema. `DeliveryModel::createFromRental()` still deliberately throws for every positive ID.

### Branch comparison and safe integration plan

`git ls-remote` verified that the local remote-tracking hashes match the live remote; no fetch or branch mutation was needed. Counts are committed HEAD versus the named branch and exclude uncommitted changes.

| Branch | Verified tip | HEAD ahead / behind | Dependency contribution |
|---|---|---|---|
| `origin/dev` | `3baa197` | 9 / 16 | Fixture-backed notification/delivery controllers and a different core Mailer; no rental/payment lifecycle |
| `origin/week-1-pasindu` | `5c24822` | 9 / 17 | Rental API design contract, wishlists, rentals, status log and reviews schema; no rental backend implementation |
| `origin/feature/week-1-trimasha` | `b63a1ae` | 9 / 18 | Blackouts, maintenance requests/photos, agreements/OTP state, handover codes, inspections/media, damage claims and change requests schema; no implemented agreement/payment lifecycle |

The teammate changes reduce the missing design/schema work but do **not** resolve executable rental, payment or maintenance workflows. Trimasha's branch references `rentals` without including its migration. Pasindu's reviews migration references `maintenance_requests`, which is absent on that branch. Both therefore have cross-branch schema dependencies. A draft contract's status/endpoint descriptions are not implemented APIs.

| Number | Current branch | Conflicting teammate use |
|---|---|---|
| 029 | Areas | Equipment blackouts |
| 030 | Personnel area IDs | Maintenance requests |
| 031 | Complaints | Wishlists |
| 032 | Complaint actions | Rentals |
| 033 | Notifications | Rental status log |
| 034 | Login attempts | Maintenance request photos |
| 035 | Deliveries/actions | Rental agreements |

Distinct filenames may avoid a textual Git conflict, but duplicate numeric IDs conflict with migration tracking and the Week 1 upgrade runner's prefix-based selection. The compared branch trees omit current area/complaint/notification migrations and database models. Preserve the current security checks and persistence when reconciling their fixture-based controllers.

Plan, without performing any merge:

1. Preserve this working tree and review a concrete diff in a separate integration workspace after authorization. Agree migration ownership and unique identifiers; preserve migrations already applied by teammates and supply explicit upgrade mapping rather than silently renumbering applied history.
2. Build one dependency-ordered migration manifest: users/subtypes/equipment, areas/personnel assignments, maintenance requests and rentals, then agreement/status/handover/inspection dependents and reviews after both rentals and maintenance. Keep current complaints, notifications, login audit and deliveries. Test both clean creation and upgrades with retained records. Do not import demo dumps over application databases.
3. Reconcile add/add `DeliveryController` differences, shared routes/API/frontend changes, and the two global `Mailer` classes (`backend/core` versus `backend/services`, void versus bool contract). Keep one agreed transport contract; loading both classes would redeclare `Mailer`. Preserve DB recipient isolation rather than adopting per-role fixture notifications.
4. Obtain the messaging migrations and runnable synthetic fixtures from its owner. Re-run all four messaging suites without skipping populated-thread and concurrency coverage.
5. Integrate the rental/agreement/payment owners' actual implementations. Require a durable verified paid transition, clear district-to-area resolution, an agreed nullable/system assignment policy instead of today's mandatory `assigned_by`, rental/leg FKs and unique constraints, and transaction-safe retry handling before implementing `createFromRental`. Add event/outbox deduplication and real OTP hashing/expiry/attempt handling before sending workflow email.
6. Re-run the suites on fresh isolated databases, then browser and authorized SMTP QA. No teammate branch has been merged by this continuation.

### Manual browser testing: current live sandbox

The separate loopback PHP server on **18083** serves this repository, not the normal Apache copy. It uses `equipify_week3_test_20261128_025551_330d568f` on MariaDB **13307**. It was initially prepared with one unread notification per role; current counts reflect subsequent manual read actions and are not reset. The synthetic manager is assigned to Week3 A and sees only SAFE-1. Notification fixtures and file emails are synthetic, not rental/payment evidence. Live mail is disabled in this PHP process.

Use separate browser profiles for simultaneous roles. Each email is `<role>@week3.test`; the public synthetic-only fixture password is `Week3-Test-Only!42`. Open a protected URL, sign in at its role portal, then reopen that URL if login lands on a dashboard.

| Role | Exact protected browser URL |
|---|---|
| customer | http://127.0.0.1:18083/frontend/Customer/Profile/index.html |
| renting_party | http://127.0.0.1:18083/frontend/Renting%20Party/Profile/index.html |
| freelance_worker | http://127.0.0.1:18083/frontend/Freelance%20Worker/Notifications/index.html |
| delivery_personnel | http://127.0.0.1:18083/frontend/Delivery%20Personnel/Profile/index.html |
| maintenance_tech | http://127.0.0.1:18083/frontend/Technician/Profile/index.html |
| area_manager | http://127.0.0.1:18083/frontend/Area%20Manager/Delivery%20Assignments/index.html |
| admin | http://127.0.0.1:18083/frontend/Admin/Profile/index.html |

1. Verify the Network response header `X-Equipify-Test-Database` equals the exact manual database above. Do not use `http://localhost/equipify` to test these changes.
2. For all seven roles: verify desktop/mobile bell counts match existing read state. If an unread notification remains, mark it read and expect the count to decrease; refresh and verify persistence. A zero count after prior testing is valid. Check keyboard focus, Escape/Close, empty state and console/network errors. The initial fixture has only two rows per role, so pagination needs additional synthetic notifications in a test-only fixture (backend and DOM tests already cover it).
3. Hide the tab: feed data should clear and count polling should stop. Return and verify refresh. Switch accounts in another tab on the same origin; notification and delivery views clear. Reload/sign in to resume after session invalidation. Use DevTools throttling to verify old replies do not restore data. Exercise browser Back/Forward restoration.
4. Manager delivery page: SAFE-1 only, Pending/Assigned/All filters, refresh and empty states. To test reassignment use only the isolated database: set the synthetic manager's `area_id` to 2, refresh, expect SAFE-2; set it to NULL, expect 409. Restore to 1 for further manual QA. Other roles must receive 403 and anonymous users 401 from `/backend/api/area-manager/deliveries`. No assignment/payment simulation is provided.
5. Inspect synthetic `.eml` artifacts locally under `tmp/week3-mail-*` and `tmp/mailer-regression-*`. File fallback is not inbox verification. Authorized SMTP QA remains separate and requires provider configuration outside Git; do not enable it on this sandbox or log OTP messages.

To reproduce tests while the isolated MariaDB is running, use a terminal at the current repository:

```powershell
$env:EQUIPIFY_DB_PORT='13307'
C:/xampp1/php/php.exe backend/tests/week3_test.php
# Use the NEW printed TEST_DATABASE for each run, never equipify:
$env:EQUIPIFY_TEST_SOURCE_DB='<new equipify_week3_test_...>'
node backend/tests/notifications_frontend_test.js
C:/xampp1/php/php.exe backend/tests/mailer_test.php
./backend/tests/run_week1.ps1 -XamppRoot C:/xampp1
./backend/tests/run_areas.ps1 -XamppRoot C:/xampp1
```

For Week 3 HTTP tests, use a second terminal with `EQUIPIFY_DB_PORT=13307` and `EQUIPIFY_DB_NAME` set to that NEW fixture and start PHP on a free 18083 with `backend/tests/isolated_router.php`, `-d disable_functions=mail`, and workspace `upload_tmp_dir`/`sys_temp_dir` overrides, then run `week3_http_test.php <same-test-name>`. Stop the current manual server first, only after verifying its recorded process identity. Week 1/area runners need free 18081 and stop their own Apache processes. Tests change fixture state; create another fresh Week 3 fixture afterward for the initial manual expectations.

The test MariaDB and manual PHP server are intentionally retained for browser QA. Their IDs and exact data path are in `tmp/week3-active-verification.json`; verify executable/command line before stopping only those processes. Other HTTP test processes were stopped. Temporary files/databases remain ignored and must not be staged. Do not stop normal XAMPP services or delete any real database. If starting from scratch, use the bootstrap walkthrough below with **C:/xampp1** tools, a NEW data directory and verified free ports; its older C:/xampp paths describe the historical run only.

**Commit decision:** READY for a partial checkpoint after the final review/hardening recorded above; not a completed Week 3 milestone or production release. Messaging schema, business-workflow dependencies, extended browser QA and real SMTP delivery remain blockers for completion. No commit or push was made.

## Historical observations (23 November and earlier)

## Follow-up bug fixes (23 November 2026)

This section supersedes the earlier audit's independently actionable frontend, dashboard and fallback findings. Earlier results below remain historical. The working tree already contained the prior implementation; those edits were preserved. No payment, agreement, rental implementation or real database was changed. No commits or pushes were made.

Fixed:
- Freelancer dashboard now requires both an active account and the freelance_worker role before returning any data. Controller and real HTTP regressions cover active, suspended, anonymous and wrong-role access; revoked sessions return no dashboard data.
- Shared notifications create a matching icon bell in each desktop/mobile topbar-actions container. One poller updates both badges.
- Polling and mark-read retain the selected page; Previous/Next navigation is available. A mark-read refresh performs one list reload plus one badge refresh.
- Shared API session versions invalidate stale replies on login/logout, pagehide and cross-window session events. BroadcastChannel is used with storage-event fallback; only a random change marker, never notification/user data, is stored. JSON responses provide X-Equipify-Identity so a changed server identity also invalidates pending/current views. The shared bell, freelancer dedicated feed and dashboard notification-derived activity clear on session invalidation. A changed session requires reloading/signing in; old requests cannot restore old content. Hidden views clear notification feed content and stop badge timers. Cached pages reload before resuming. Removing the notification view disconnects polling.
- Mailer follows EQUIPIFY_MAIL_FALLBACK=file when sending is disabled, sendmail_path is missing, or mail() fails/throws; without that explicit fallback it returns false. True on file fallback means saved file, not delivered email. Input validation failures do not become file output.
- Delivery page description now accurately describes viewing requests/schedules/status, without promising assignment.
- Outdated notification-mock comments were corrected; unrelated mocks remain.

Files changed specifically for these fixes:

```
backend/controllers/FreelanceWorkerMockController.php
backend/core/Response.php
backend/services/Mailer.php
backend/tests/areas_test.php
backend/tests/isolated_router.php
backend/tests/week1_test.php
backend/tests/week3_test.php
backend/tests/week3_http_test.php
backend/tests/mailer_test.php                         (new)
backend/tests/notifications_frontend_test.js          (new)
frontend/shared/api.js
frontend/shared/list.js
frontend/shared/notifications.js
frontend/Freelance Worker/Dashboard/script.js
frontend/Freelance Worker/Notifications/script.js
frontend/Area Manager/Delivery Assignments/index.html
docs/week-3.md
```

Test-infrastructure changes enable safe regressions: the Week 1 source database can be set to an explicitly named equipify_week3_test_* fixture with EQUIPIFY_TEST_SOURCE_DB (verified with SELECT DATABASE()); Week 1/area server connections respect EQUIPIFY_DB_PORT. Assertions were preserved. The isolated PHP router accepts strict Week 1/Week 3/area test names and mirrors root .htaccess denial rules; it is not a replacement for Apache verification.

Observed fix verification, all DB writes on a separately bootstrapped MariaDB instance on 127.0.0.1:13307:

| Suite | Result |
|---|---|
| week3_test.php | 129 checks passed |
| week3_http_test.php | 88 checks passed |
| notifications_frontend_test.js | 18 behavioral checks passed using a DOM adapter; not browser QA |
| mailer_test.php | 8 subprocess cases passed; mail() disabled in every child, no SMTP possible |
| complaints_test.php --database | 131 checks passed on Week 3 fixtures |
| complaints_controller_test.php | 39 checks passed on Week 3 fixtures |
| Week 1 database suite | 50 checks passed, 34 migrations applied only to fresh test DB, schema-clone upgrade passed; included complaint suites: 132 and 39 checks |
| week1_http_test.php | 62 checks passed through isolated PHP server; output says Apache, but Apache was not used |
| complaints_security_test.php | 664 session/account-status assertions passed; 102 suspended/banned requests denied |
| areas_test.php | Model persistence, uniqueness and status checks passed |
| area_scope_http_test.php | 284 HTTP assertions passed (168 base + 116 area-scope checks) |
| PHP syntax | 91 files passed |
| JavaScript syntax | 7 affected/test scripts passed |
| git diff --check | Passed |

Runner limitations observed and retained: run_week1.ps1 and run_areas.ps1 passed database stages but their Apache configuration check failed with `DocumentRoot must be a directory`. Equivalent HTTP suites were then run using the isolated PHP router. The first PHP area run encountered a startup upload-temp notice that prevented valid headers; it was rerun on a fresh isolated area database with upload_tmp_dir and sys_temp_dir explicitly set to the workspace tmp directory, and all 284 assertions passed. These were environment/runner failures, not silently reported as passes. No test assertions were weakened.

Reproduce after the separate MariaDB bootstrap described below:

```powershell
$env:EQUIPIFY_DB_PORT='13307'
C:/xampp/php/php.exe backend/tests/week3_test.php
# Set to the newly printed name; never equipify:
$env:EQUIPIFY_DB_NAME='<equipify_week3_test_...>'
$env:EQUIPIFY_TEST_SOURCE_DB=$env:EQUIPIFY_DB_NAME
node backend/tests/notifications_frontend_test.js
C:/xampp/php/php.exe backend/tests/mailer_test.php
# Start isolated PHP on 18083 as below, then:
C:/xampp/php/php.exe backend/tests/week3_http_test.php $env:EQUIPIFY_DB_NAME
C:/xampp/php/php.exe backend/tests/complaints_test.php --database
C:/xampp/php/php.exe backend/tests/complaints_controller_test.php
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/run_week1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/run_areas.ps1
```

For the PHP HTTP fallback, start the existing isolated_router.php on 18081 with EQUIPIFY_DB_NAME set to the fresh Week 1 or area database printed by its setup suite. Add PHP flags `-d upload_tmp_dir="<absolute workspace>/tmp" -d sys_temp_dir="<absolute workspace>/tmp"`. Run `week1_http_test.php <week1-test-name>` or `area_scope_http_test.php <area-test-name>`, respectively, then stop only the server process you started. Restore EQUIPIFY_TEST_SOURCE_DB and other environment settings afterward.

Still blocked: real paid-rental delivery creation/idempotency, Peiris payment callback integration, agreement OTP lifecycle and rental/payment/deadline event wiring. No fake rental/payment persistence was introduced. Still manual: desktop/mobile visuals and keyboard use, real-browser multi-window account switching/BFCache/network throttling, delivery filtering/layout, Apache serving in the user's local setup and authorized SMTP inbox delivery. File fallback can contain synthetic OTPs; keep generated files private and outside git.

## Audit before changes

Branch: `feature/admin-ui-updates`. Working tree was clean. No branch changes, commits, migrations on equipify, resets, pushes or PRs were made.

Existing architecture: session Auth, custom Router, Response envelopes, ListQuery page/per_page clamping, NotificationModel/Service and two notification routes already existed. Recipient identity is a globally unique users.user_id; users have one authoritative role. Revalidating that database role against the session prevents a forged/stale role from reading that identity's notifications. No notification recipient_role column is needed.

Missing: unread-count endpoint, live shared bells, persisted freelancer feed. Mailer and its alleged file implementation, inbox-mock.js and notification fixtures are absent from tracked source. Unrelated messages mocks remain. Freelancer notification generators were replaced, including dashboard count/activity sources.

No rentals, agreements, payment tables, successful PayHere callback or OTP lifecycle exists. Schema 035 explicitly states rental booking is absent; deliveries.assigned_by is required and references an area manager. Creating an unassigned paid-rental delivery cannot be implemented truthfully against this schema. No schema was invented and no teammate workflows were edited.

## Final requirement status

| Requirement | Status | Evidence / limitation |
|---|---|---|
| Notification list, read, unread count, seven roles | COMPLETE | 122 model/controller/email checks and 75 HTTP checks; session/database identity, parameterized queries, safe pagination |
| Shared notification frontend and freelancer replacement | PARTIAL | Integrated protected pages, modal list, read action, pagination, active-page 30s polling, no storage cache, request guards and cleanup; browser visual/lifecycle verification remains |
| Real mail transport with configurable file fallback | PARTIAL | New Mailer supports PHP mail through XAMPP sendmail, explicit opt-in, safe failure; file rendering tested; SMTP acceptance/delivery not tested |
| Four reusable escaped templates | COMPLETE | OTP, rental accepted, payment due, deadline missed tested |
| OTP and rental event wiring | BLOCKED | Authoritative agreement/rental event lifecycle absent; interfaces documented below |
| DeliveryModel::createFromRental/payment integration | BLOCKED | Invalid ID returns invalid; positive ID explicitly throws LogicException before any DB access; no paid validation, creation, duplicate/concurrency guarantee is claimed |
| Area manager delivery API | COMPLETE | Session role and active assigned area; own-area rows only, pagination, status, safe summaries, 409 for no area |
| Area delivery frontend | PARTIAL | Live read-only list, refresh, filtering and pagination replace fabricated assignments; browser QA outstanding |
| Automated Week 3 backend tests | PARTIAL | 197 checks passed; paid/self-collection/idempotency/concurrent creation tests blocked with missing rental integration |
| Week 1 / Week 2 regression | PARTIAL | Existing Week 1 and area runners attempted and blocked at unavailable port 3306. Complaint suites pass on isolated Week 3 database; full HTTP regression not claimed |
| Manual guide | COMPLETE | Steps below; no manual browser or real SMTP testing claimed |

## Routes and schema

Added `GET /notifications/unread-count` for all seven roles and `GET /area-manager/deliveries` for area_manager only.
Preserved `GET /notifications`, `POST /notifications/read` (notification_id or all:true); freelancer GET /freelancer/notifications and POST /freelancer/notifications/read now alias the real controller.
Unread-count response data is `{count: integer}`. Lists retain `{items,page,per_page,total,total_pages}` inside Response's success/data envelope. Invalid list parameters clamp/drop according to ListQuery. Foreign notification IDs return marked:0, without revealing existence.

No migrations or constraints added. No application records were read or changed in equipify. All new DB test mutations occurred in newly created equipify_week3_test_* databases on a separately bootstrapped MariaDB data directory, port 13307. Tests explicitly verify SELECT DATABASE(). Existing regression runners failed before migration.

## Integration contracts

Peiris: current public signature `DeliveryModel::createFromRental(int $rentalId): array`. This boundary is deliberately NOT READY for production invocation: positive IDs throw LogicException. Do not add it to a payment callback until authoritative persisted rentals/payment and outbound/return logistics schema arrives. Then implement paid-row locking inside the callback's PDO transaction, load authoritative addresses/area/logistics, represent each applicable leg with a unique (rental_id, leg) constraint, return created/already_exists/not_applicable/invalid, and leave payment state and personnel assignment to their owners. Do not swallow an exception and report callback success with missing deliveries. Existing assigned_by requirement must be resolved with schema owner before automated unassigned requests are possible. No successful payment simulation is provided because that would fabricate unsupported rental semantics.

Agreement owner: generate unpredictable OTP with random_int or random_bytes; persist only a hash and expiry/attempt state in the existing lifecycle once introduced. Pass transient plaintext only to `EmailTemplates::render('otp', ['name'=>..., 'otp'=>...])`, then `Mailer::send($email, $template['subject'], $template['html'])`. Treat false as failure; never log code or full message. File mail intentionally contains the OTP, so use synthetic codes only in testing, restrict directory access and retention. Never store generated messages in git.

Rental owner: after durable accepted transition, emit existing NotificationService::notify exactly once per event and render rental_accepted with name/reference. Payment_due/deadline_missed use same interface and optional due_at. No event emission was added to absent workflows; lifecycle owners must supply transaction/outbox and event deduplication. Mailer has no preexisting callers/API to preserve in this checkout; new signature is send(string to,string subject,string html): bool. True means transport acceptance or explicitly configured file output, not guaranteed mailbox delivery.

## Automated commands and observed results

PowerShell from repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/run_week1.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/run_areas.ps1
```

Observed: both BLOCKED with SQLSTATE HY000/2002, port 3306 refused. Do not interpret as assertion failures or passing regression runs.

The following ran on the separate MariaDB instance (setup below):

```powershell
$env:EQUIPIFY_DB_PORT='13307'
C:/xampp/php/php.exe backend/tests/week3_test.php
# Copy the exact generated TEST_DATABASE name from the output:
$env:EQUIPIFY_DB_NAME='equipify_week3_test_20261123_155651_a33ef4f8'
C:/xampp/php/php.exe backend/tests/week3_http_test.php $env:EQUIPIFY_DB_NAME
C:/xampp/php/php.exe backend/tests/complaints_test.php
C:/xampp/php/php.exe backend/tests/complaints_controller_test.php
```

Observed: Week 3 122/122; HTTP 75/75; complaint policy/upload 118/118; complaint controller 39/39. Total 354 checks, zero assertion failures in these four suites. Final PHP lint passed all 90 PHP files. Node syntax checks passed notifications.js, the delivery script and freelancer notification script. git diff --check passed. HTTP tests used real PHP sessions and Router on port 18083, not a browser. No SMTP calls were made. Test fixtures/mail/logs are ignored under tmp.

## Safe Windows/XAMPP/phpMyAdmin/Chrome walkthrough

1. Open XAMPP Control Panel. Start Apache for phpMyAdmin if needed. MySQL Start runs your normal server; do not run tests or migrations against its equipify database. For the isolated workflow below leave normal MySQL untouched. We used an entirely separate MariaDB server on 13307.
2. In PowerShell at repository root, bootstrap a new, never reused directory and start a standalone server. Do not pass a Windows service option:

```powershell
$testData = Join-Path (Get-Location) ('tmp/manual-week3-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testData | Out-Null
C:/xampp/mysql/bin/mysql_install_db.exe --datadir=$testData --port=13307
$mysqlTest = Start-Process C:/xampp/mysql/bin/mysqld.exe -ArgumentList @('--no-defaults', ('--datadir="' + $testData + '"'), '--port=13307', '--bind-address=127.0.0.1', '--console') -WindowStyle Hidden -PassThru
$oldDb = $env:EQUIPIFY_DB_NAME
$oldPort = $env:EQUIPIFY_DB_PORT
$env:EQUIPIFY_DB_PORT='13307'
C:/xampp/php/php.exe backend/tests/week3_test.php
# Set the NEW name printed by your run, never equipify:
$env:EQUIPIFY_DB_NAME='<paste TEST_DATABASE name>'
if ($env:EQUIPIFY_DB_NAME -notmatch '^equipify_week3_test_[a-z0-9_]+$') { throw 'Wrong database' }
$phpTest = Start-Process C:/xampp/php/php.exe -ArgumentList @('-S','127.0.0.1:18083','-t','.','backend/tests/isolated_router.php') -WindowStyle Hidden -PassThru
```

If 13307 or 18083 is occupied, stop here; do not stop someone else's service. Existing generated test directories/databases may be retained for review. week3_test.php creates the database (CREATE without IF NOT EXISTS), checks the selected name, applies schema excluding 000, and creates only synthetic fixtures. It needs no real database.

3. phpMyAdmin normally targets port 3306. To inspect this run, add/select a local phpMyAdmin server entry with host 127.0.0.1, port 13307, root and empty password (local isolated instance only). Never change its default server's database. In SQL run `SELECT DATABASE(), @@port;` after selecting the printed test database. Expected exact test name and 13307. Tables: users, notifications, areas, area_managers, deliveries. Do not import schema/000_create_database.sql. Alternative: `C:/xampp/mysql/bin/mysql.exe -h127.0.0.1 -P13307 -uroot <test-name>`.
4. Fixtures have emails ROLE@week3.test for each of customer, renting_party, freelance_worker, delivery_personnel, maintenance_tech, area_manager, admin. Password `Week3-Test-Only!42`, no real addresses. Each gets two notifications, first read and second unread: expected badge 1 before HTTP tests; 0 after HTTP tests mark all. The area manager ends unassigned intentionally for 409 tests. Each delivery has safe addresses and references SAFE-1/SAFE-2.
5. Chrome: open http://127.0.0.1:18083/frontend/Customer/Profile/index.html and use its login redirect. For other roles open their existing Profile or Dashboard pages and corresponding login forms; use the above account for that role. Freelancer has a dedicated Notifications navigation entry. Click the bell, inspect title/body, click Mark read: badge changes 1 to 0, refresh keeps it 0. Run in separate browser profiles for separate roles. No notification storage is used. Logout clears the panel; verify another user's feed is absent. For another test cycle rerun week3_test.php to create a fresh database and restart the PHP test process with its name.
6. DevTools > Network: filter notifications. Expect GET /notifications, GET /notifications/unread-count, POST /notifications/read; credentials are session cookies and request JSON contains notification_id only. While active count polls approximately every 30 seconds. Hide tab and verify polling pauses; return to refresh; navigate away and verify no intervals from the old document. In Console verify no unhandled rejection. Stop PHP server temporarily for an error state; empty fixtures yield 'No notifications yet'. Verify mobile/desktop bells share one count poller. These browser checks have NOT been performed by the agent.
7. Delivery list: in the selected test database only, set test manager area_id to the area with name Week3 A (use users.email='area_manager@week3.test' to identify it). Open http://127.0.0.1:18083/frontend/Area%20Manager/Delivery%20Assignments/index.html. Expect only SAFE-1. Change assignment to Week3 B, refresh: only SAFE-2. Set NULL: visible assigned-area error (409). A customer/admin requesting that API gets 403; anonymous gets 401. status=delivered returns empty. area_id=2 query cannot override assignment. Delivery page offers no fabricated assignment action.
8. To create a second manager for simultaneous cross-area testing use the existing Admin Area Managers registration UI with synthetic email/phone, assign Week3 B, then log in via another Chrome profile. Existing application route scope derives the area from the manager row on every call. Do not add rental/payment mock tables or claim the two SAFE-* fixtures came from payment.
9. Email file output: week3_test.php renders all four templates and writes four .eml files to tmp/week3-mail-*. Inspect locally using a text editor; synthetic OTP only. File transport environment: EQUIPIFY_MAIL_TRANSPORT=file, EQUIPIFY_MAIL_FROM=sender@example.test, EQUIPIFY_MAIL_FROM_NAME=Equipify, optional EQUIPIFY_MAIL_DIRECTORY pointing to a private folder outside the served tree. Default tmp/mail is HTTP-blocked by root .htaccess; the isolated router never serves tmp. Protect generated files and do not copy them into frontend.
10. Optional authorized SMTP only: configure XAMPP php/php.ini sendmail_path to C:/xampp/sendmail/sendmail.exe -t, and sendmail/sendmail.ini smtp_server/smtp_port/auth_username/auth_password using an authorized test provider/mailbox. Keep credentials outside git. Set EQUIPIFY_MAIL_TRANSPORT=sendmail, EQUIPIFY_MAIL_ENABLE_SEND=1, EQUIPIFY_MAIL_FROM to a provider-authorized sender; optional EQUIPIFY_MAIL_FALLBACK=file. Restart only your test PHP/Apache process to inherit env. A false result is failure; file fallback true means a file was saved, not SMTP success. Inspect the authorized inbox to verify actual delivery. Do not enable sendmail debug/message logs that expose OTPs. This step was NOT executed.
11. Restore configuration without touching real data:

```powershell
Stop-Process -Id $phpTest.Id
Stop-Process -Id $mysqlTest.Id
$env:EQUIPIFY_DB_NAME=$oldDb
$env:EQUIPIFY_DB_PORT=$oldPort
Remove-Item Env:EQUIPIFY_MAIL_ENABLE_SEND -ErrorAction SilentlyContinue
```

Stop only processes you created. Do not delete databases, reset schema, or kill normal XAMPP services. Remove an optional phpMyAdmin test-server entry if you added one. Restore any local mail configuration you changed, leaving SMTP disabled. No real database restoration is needed.

## Remaining verification and limitations

Full Week 1/area HTTP regression requires its existing port-3306 environment and source schema; it was attempted but unavailable. Browser appearance, keyboard interactions, account switching, frontend lifecycle behavior and real SMTP remain manual. Delivery payment idempotency/concurrency, pickup/return applicability, unpaid rejection and real rental references cannot be verified or implemented until authoritative schema exists. No Week 4 assignment or Week 5 lifecycle implementation was added.

## Exact modified and added paths

- `backend/api/index.php`
- `backend/config/db_config.php`
- `backend/controllers/DeliveryController.php`
- `backend/controllers/FreelanceWorkerMockController.php`
- `backend/controllers/NotificationController.php`
- `backend/models/DeliveryModel.php`
- `backend/models/NotificationModel.php`
- `backend/routes.php`
- `backend/services/.htaccess`
- `backend/services/EmailTemplates.php`
- `backend/services/Mailer.php`
- `backend/services/NotificationService.php`
- `backend/tests/isolated_router.php`
- `backend/tests/week3_http_test.php`
- `backend/tests/week3_test.php`
- `docs/week-3.md`
- `frontend/Admin/Area Managers/index.html`
- `frontend/Admin/Complaints & Users/index.html`
- `frontend/Admin/Dashboard/index.html`
- `frontend/Admin/Document Verification/index.html`
- `frontend/Admin/Equipment Catalogue/index.html`
- `frontend/Admin/Profile/index.html`
- `frontend/Area Manager/Complaints/index.html`
- `frontend/Area Manager/Dashboard/index.html`
- `frontend/Area Manager/Delivery Assignments/index.html`
- `frontend/Area Manager/Delivery Assignments/script.js`
- `frontend/Area Manager/Delivery Personnel/index.html`
- `frontend/Area Manager/Maintenance Assignments/index.html`
- `frontend/Area Manager/Maintenance Technicians/index.html`
- `frontend/Area Manager/Profile/index.html`
- `frontend/Area Manager/Vehicles/index.html`
- `frontend/Customer/Complaints/index.html`
- `frontend/Customer/Job History/index.html`
- `frontend/Customer/Messages/index.html`
- `frontend/Customer/Profile/index.html`
- `frontend/Customer/Rental History/index.html`
- `frontend/Customer/Wishlist/index.html`
- `frontend/Delivery Personnel/Complaints/index.html`
- `frontend/Delivery Personnel/Dashboard/index.html`
- `frontend/Delivery Personnel/Messages/index.html`
- `frontend/Delivery Personnel/Profile/index.html`
- `frontend/Freelance Worker/Complaints/index.html`
- `frontend/Freelance Worker/Credentials/index.html`
- `frontend/Freelance Worker/Dashboard/index.html`
- `frontend/Freelance Worker/Job History/index.html`
- `frontend/Freelance Worker/Job Offers/index.html`
- `frontend/Freelance Worker/Messages/index.html`
- `frontend/Freelance Worker/Notifications/index.html`
- `frontend/Freelance Worker/Notifications/script.js`
- `frontend/Freelance Worker/Payments/index.html`
- `frontend/Freelance Worker/Profile/index.html`
- `frontend/Renting Party/Complaints/index.html`
- `frontend/Renting Party/Dashboard/index.html`
- `frontend/Renting Party/Equipment Details/index.html`
- `frontend/Renting Party/Messages/index.html`
- `frontend/Renting Party/My Equipment/index.html`
- `frontend/Renting Party/Profile/index.html`
- `frontend/Renting Party/Rental Requests/index.html`
- `frontend/shared/notifications.js`
- `frontend/Technician/Complaints/index.html`
- `frontend/Technician/Dashboard/index.html`
- `frontend/Technician/Messages/index.html`
- `frontend/Technician/Profile/index.html`

## Git diff summary

 backend/api/index.php                              |   1 +
 backend/config/db_config.php                       |   2 +-
 .../controllers/FreelanceWorkerMockController.php  |  62 +----
 backend/controllers/NotificationController.php     |  10 +-
 backend/models/NotificationModel.php               |  17 +-
 backend/routes.php                                 |   6 +-
 backend/services/NotificationService.php           |   2 +-
 backend/tests/isolated_router.php                  |   2 +-
 frontend/Admin/Area Managers/index.html            |   1 +
 frontend/Admin/Complaints & Users/index.html       |   1 +
 frontend/Admin/Dashboard/index.html                |   1 +
 frontend/Admin/Document Verification/index.html    |   1 +
 frontend/Admin/Equipment Catalogue/index.html      |   1 +
 frontend/Admin/Profile/index.html                  |   1 +
 frontend/Area Manager/Complaints/index.html        |   1 +
 frontend/Area Manager/Dashboard/index.html         |   1 +
 .../Area Manager/Delivery Assignments/index.html   | 300 +--------------------
 .../Area Manager/Delivery Assignments/script.js    | 222 +++------------
 .../Area Manager/Delivery Personnel/index.html     |   1 +
 .../Maintenance Assignments/index.html             |   1 +
 .../Maintenance Technicians/index.html             |   1 +
 frontend/Area Manager/Profile/index.html           |   1 +
 frontend/Area Manager/Vehicles/index.html          |   1 +
 frontend/Customer/Complaints/index.html            |   1 +
 frontend/Customer/Job History/index.html           |   1 +
 frontend/Customer/Messages/index.html              |   1 +
 frontend/Customer/Profile/index.html               |   1 +
 frontend/Customer/Rental History/index.html        |   1 +
 frontend/Customer/Wishlist/index.html              |   1 +
 frontend/Delivery Personnel/Complaints/index.html  |   1 +
 frontend/Delivery Personnel/Dashboard/index.html   |   1 +
 frontend/Delivery Personnel/Messages/index.html    |   1 +
 frontend/Delivery Personnel/Profile/index.html     |   1 +
 frontend/Freelance Worker/Complaints/index.html    |   1 +
 frontend/Freelance Worker/Credentials/index.html   |   1 +
 frontend/Freelance Worker/Dashboard/index.html     |   1 +
 frontend/Freelance Worker/Job History/index.html   |   1 +
 frontend/Freelance Worker/Job Offers/index.html    |   1 +
 frontend/Freelance Worker/Messages/index.html      |   1 +
 frontend/Freelance Worker/Notifications/index.html |   1 +
 frontend/Freelance Worker/Notifications/script.js  |  11 +-
 frontend/Freelance Worker/Payments/index.html      |   1 +
 frontend/Freelance Worker/Profile/index.html       |   1 +
 frontend/Renting Party/Complaints/index.html       |   1 +
 frontend/Renting Party/Dashboard/index.html        |   1 +
 .../Renting Party/Equipment Details/index.html     |   1 +
 frontend/Renting Party/Messages/index.html         |   1 +
 frontend/Renting Party/My Equipment/index.html     |   1 +
 frontend/Renting Party/Profile/index.html          |   1 +
 frontend/Renting Party/Rental Requests/index.html  |   1 +
 frontend/Technician/Complaints/index.html          |   1 +
 frontend/Technician/Dashboard/index.html           |   1 +
 frontend/Technician/Messages/index.html            |   1 +
 frontend/Technician/Profile/index.html             |   1 +
 54 files changed, 112 insertions(+), 566 deletions(-)

New untracked files above are part of the implementation; git diff --stat omits them until staged. No files were staged or committed. Most HTML changes are one script include for the shared notification bell. The delivery page removes static assignment fixtures and their fake state transitions. Database config adds a process environment port override for the isolated server; normal defaults remain unchanged. The existing CLI test router now also allows the strict week3 test database prefix.
