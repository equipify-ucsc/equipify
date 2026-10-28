# Rental design and API contract

Owner: K.W.P.N. Vidmantha · Reviewers: K.T.D. Rangajeewa, T.S.I. Peiris · Week 1 (draft for the design session)

Every rental page and endpoint from Week 2 onwards is built against this
document, so the pages and the backend can be written in parallel. The schema
it describes is `schema/031`–`033` and `055`. After the Week 1 merge, a change
here that touches the schema needs a new migration. Never edit a merged one.

---

## Part A — Rental design (to freeze in the session)

### A.1 Statuses

`rentals.status` (032) and `rental_status_log.from_status / to_status` (033)
use exactly this list:

```
requested → accepted → agreement_signed → paid → active ─┬→ returned → closed
                                                          └→ overdue → returned → closed
exits:  rejected · cancelled · expired
```

| Status | Meaning | Holds stock? |
|---|---|---|
| `requested` | Sent by the customer, waiting for the renting party | no |
| `accepted` | Accepted; the agreement is generated but not yet signed | yes |
| `agreement_signed` | The customer signed the agreement with the emailed OTP | yes |
| `paid` | Paid in full (PayHere callback); waiting for the handover | yes |
| `active` | Handed over with the pickup/delivery code | yes |
| `overdue` | Not returned within `return_grace_hours` (24 h) after `end_date` | yes |
| `returned` | Handed back with the return code; post-return inspection pending | yes |
| `closed` | Inspection done and the deposit settled (released, or via a damage claim) | no |
| `rejected` | The renting party declined (`reject_reason`) | no |
| `cancelled` | The customer withdrew the request (`cancel_reason`) | no |
| `expired` | A deadline was missed (see A.3) | no |

"Holds stock" is the input to Rangajeewa's availability rule: units free =
`equipment.quantity` − units in overlapping rentals that hold stock − units
blacked out. Rangajeewa's availability rules doc is the final word on this.

"Return due" is **not** a status. The page shows it when `status = active` and
today ≥ `end_date`.

### A.2 Transitions and who makes them

| From → To | Who | How | Built |
|---|---|---|---|
| — → `requested` | Customer | `POST /customer/rentals` | W2 (V) |
| `requested` → `cancelled` | Customer | `POST /customer/rentals/{id}/cancel` | W2 (V) |
| `requested` → `accepted` | Renting party | `POST /renting-party/rentals/{id}/accept` (generates the agreement, sets `pay_by`) | W2 (R), agreement W3 (R) |
| `requested` → `rejected` | Renting party | `POST /renting-party/rentals/{id}/reject` | W2 (R) |
| `requested` → `expired` | System | `respond_by` passed | W2 (V) |
| `accepted` → `agreement_signed` | Customer | `POST /customer/rentals/{id}/agreement/sign` | W3 (V) |
| `accepted` / `agreement_signed` → `expired` | System | `pay_by` passed | W2 (V) |
| `agreement_signed` → `paid` | System | PayHere notify callback, signature checked | W3–4 (P) |
| `paid` → `active` | Renting party (self pickup) or delivery person (platform delivery) | Enters the customer's one-time handover code | W5 (R, V) |
| `active` → `overdue` | System | Escalation job, 24 h after `end_date` | W7 (R) |
| `active` / `overdue` → `returned` | Renting party (self return) or delivery person (platform return) | Enters the return code | W6 (R, V) |
| `returned` → `closed` | Renting party, or Admin after a damage claim | Post-return inspection with no damage, or the claim is settled | W6 (R, P) |

Every transition writes one `rental_status_log` row in the same transaction
(`changed_by` = the session user, NULL for the system), sets that status's
`*_at` column, and calls `NotificationService::notify()` for the other party.

Open questions for the session:
1. Can a customer also cancel after `accepted` but before paying? The proposal
   is **no**: they let `pay_by` pass, and it expires.
2. Can a renting party cancel after accepting? The proposal is **no** for now.
   A cancellation after acceptance goes through an admin (complaint).

### A.3 Deadlines and dates

These match `frontend/shared/rental-timing.js`. The server is the authority, and
the page only shows the values the API returns.

- **"1 day"** means until 23:59:59 on the next calendar day (+05:30), not a
  rolling 24 h.
  - `respond_by` = end of the day after `created_at`.
  - `pay_by` = end of the day after `accepted_at`. It covers both signing the
    agreement and paying.
- **Missed deadline → `expired`.** The reason is clear from the log's
  `from_status` (`requested` = no response, `accepted`/`agreement_signed` =
  not paid).
- **Earliest start:** `start_date ≥ today + min_lead_days` (4, from
  `platform_settings`).
- **End:** `end_date > start_date`.
- **Days charged:** `end_date − start_date` (same as `Timing.daysBetween`).
- **Handover:** Equipify delivers, or the customer collects, on the day before
  `start_date`.
- **Lazy expiry:** `RentalService::expireOverdueDeadlines()` runs at the start
  of every rental read (both list endpoints and both show endpoints). The
  pages never decide that something expired. They only count down.

### A.4 Money

Copied onto the rental when it is requested, so later price changes don't affect a booking:

```
rental_fee_lkr   = daily_rate_lkr × days × units
delivery_fee_lkr = platform_delivery ? fee from delivery_fee_rates (Peiris, 048) : 0
deposit_lkr      = equipment.deposit_lkr × units
total_lkr        = rental_fee_lkr + delivery_fee_lkr + deposit_lkr     ← what the customer pays
```

- The customer pays **no platform fee**. Commission is taken from the renting
  party's share (Peiris's money rules).
- `late_fee_lkr` starts at 0 and builds up while overdue (the
  `late_fee_pct_of_daily_rate` setting). It is charged separately and never
  added to `total_lkr`.
- The quote endpoint (B.2) replaces the hard-coded `DELIVERY_FEE = 15000` in
  Confirm Request and the Detailed page.

Open question: is the deposit per unit (as above) or per rental? `equipment.deposit_lkr` is documented as "the deposit", without saying which. Today, Confirm Request shows the deposit once, but leaves it **out** of its total (`priceTotal = rental + delivery`). From W2, the page shows the server's `total_lkr`, which includes the deposit.

### A.5 Status → page tabs

| `status` | Customer Rental History tab (`data-filter`) | Renting party Rental Requests filter |
|---|---|---|
| `requested` | Awaiting Response (`response`) | Awaiting Your Response (`response`) |
| `accepted`, `agreement_signed` | Payment Due (`payment`) | Awaiting Payment (`payment`) |
| `paid`, `active`, `overdue`, `returned` | Upcoming & Active (`active`) | Confirmed (`confirmed`) |
| `closed` | Completed (`completed`) | Confirmed (`confirmed`) |
| `rejected` | Cancelled (`cancelled`) | Rejected (`rejected`) |
| `cancelled`, `expired` | Cancelled (`cancelled`) | Expired / Cancelled (`expired`) |

Each rental object includes this as `tab`, so the pages don't map statuses themselves.

---

## Part B — Endpoints

### B.1 Conventions

The conventions are the same as the rest of the API (`core/Response.php`, `routes.php`):

- **Success:** `{"success": true, "data": …}`.
- **Failure:** `{"success": false, "error": "message", "fields": {"field": "message"}}`.
  `fields` is only present on 422.
- **Writes:** POST bodies are JSON. Actions are `POST /…/{id}/<verb>`, like
  `/customer/jobs/{id}/publish`.
- **Ids:** `{id}` is the numeric `rental_id`. Pages can show `rental_ref` but
  link with the id, e.g. `Payment/index.html?rental=42`.
- **Identity:** always from the session. A rental that is not the caller's
  returns **404**, the same as one that doesn't exist.
- **Dates and times:** dates are `YYYY-MM-DD`, timestamps are
  `YYYY-MM-DD HH:MM:SS` in +05:30.
- **Money:** numbers in LKR (floats, cast in the presenter), never strings.

| Code | When |
|---|---|
| 401 | Not signed in |
| 403 | Signed in with the wrong role (route gate) |
| 404 | No such rental for this user |
| 409 | The action doesn't fit the current status, or its deadline has passed (the message says which; the page refreshes) |
| 422 | Validation failed; `fields` keys are the request JSON keys below |

### B.2 The rental object

Returned by every rental endpoint (list items and single). The customer and
renting party views share everything except the `counterparty` block.

```json
{
  "rental_id": 42,
  "rental_ref": "RQ-000042",
  "status": "accepted",
  "tab": "payment",
  "equipment": {
    "equipment_id": 7,
    "title": "Bobcat S650 Skid-Steer Loader",
    "category_icon": "agriculture",
    "photo_url": "/equipment/7/photos/12",
    "district": "Gampaha",
    "serial_no": "B3ZT11234"
  },
  "counterparty": {
    "user_id": 15,
    "name": "Lanka Earthmovers",
    "district": "Gampaha",
    "phone": null
  },
  "start_date": "2026-11-05",
  "end_date": "2026-11-12",
  "handover_date": "2026-11-04",
  "days": 7,
  "units": 1,
  "logistics": "platform_delivery",
  "return_logistics": null,
  "delivery_address": "No. 42, Temple Road, Maharagama",
  "delivery_district": "Colombo",
  "pickup_address": null,
  "onsite_contact_name": "Nimal Perera",
  "onsite_contact_phone": "0768452210",
  "notes": "Site access is through the north gate.",
  "price": {
    "daily_rate_lkr": 12000,
    "rental_fee_lkr": 84000,
    "delivery_fee_lkr": 15000,
    "deposit_lkr": 25000,
    "late_fee_lkr": 0,
    "total_lkr": 124000
  },
  "respond_by": "2026-10-29 23:59:59",
  "pay_by": "2026-10-30 23:59:59",
  "reject_reason": null,
  "cancel_reason": null,
  "outcome": null,
  "actions": { "can_cancel": false, "can_accept": false, "can_reject": false, "can_sign": true, "can_pay": false },
  "created_at": "2026-10-28 10:15:00",
  "accepted_at": "2026-10-29 09:02:11",
  "agreement_signed_at": null,
  "paid_at": null,
  "active_at": null,
  "overdue_at": null,
  "returned_at": null,
  "closed_at": null,
  "rejected_at": null,
  "cancelled_at": null,
  "expired_at": null
}
```

- **`counterparty`:** for the customer it is the renting party
  (`business_name`, district). For the renting party it is the customer
  (`company_name` or `full_name`, district). `phone` is only filled once the
  rental is `paid` or later.
- **`pickup_address`:** the renting party's `equipment.address`, only for
  `self_pickup` and only once the rental is `paid` (Confirm Request already
  says so).
- **`outcome`:** readable text for the exit states, e.g. "No response by the
  deadline", "Customer did not pay in time", or "Rejected: Under
  maintenance". The pages show it as is (Rental Requests already has an
  `outcome` field).
- **`actions`:** the server's decision about which buttons to show, like
  `can_edit` on jobs. The pages never work out the rules themselves.

### B.3 Customer endpoints (role `customer`)

#### `POST /customer/rentals/quote`: price preview (W2)
For Confirm Request and the Detailed page's price box. It saves nothing.

Request
```json
{ "equipment_id": 7, "start_date": "2026-11-05", "end_date": "2026-11-12", "units": 1,
  "logistics": "platform_delivery", "district": "Colombo" }
```
Response `200`
```json
{ "days": 7, "handover_date": "2026-11-04", "earliest_start": "2026-11-01",
  "units_available": 2,
  "price": { "daily_rate_lkr": 12000, "rental_fee_lkr": 84000, "delivery_fee_lkr": 15000,
             "deposit_lkr": 25000, "total_lkr": 124000 } }
```
`district` is optional. Without it, `delivery_fee_lkr` is the fee for the
listing's own district. Errors: 404 (listing missing or not `available`), 422
(same date and unit rules as below).

#### `POST /customer/rentals`: place a request (W2)
Request (keys match the Confirm Request `name` attributes)
```json
{
  "equipment_id": 7,
  "start_date": "2026-11-05",
  "end_date": "2026-11-12",
  "units": 1,
  "logistics": "platform_delivery",
  "address_line1": "No. 42, Temple Road",
  "address_line2": "",
  "city": "Maharagama",
  "district": "Colombo",
  "contact_name": "Nimal Perera",
  "contact_phone": "076 845 2210",
  "notes": "Site access is through the north gate.",
  "agree_terms": true
}
```
- **`logistics`:** `platform_delivery` or `self_pickup`. The page's URL keeps
  `delivery|self`, and maps them when it builds the body.
- **Address:** for `platform_delivery`, `address_line1`, `city` and `district`
  (one of the 25 districts) are required. The server stores
  `delivery_address = line1[, line2], city` and `delivery_district`. For
  `self_pickup` they are ignored.
- **Contact:** `contact_name` 2–150 characters. `contact_phone` is a Sri Lankan
  mobile (`07XXXXXXXX` or `+947XXXXXXXX`) and is stored normalised.
- **Notes:** up to 500 characters.
- **Terms:** `agree_terms` must be `true`.
- **Server checks:**
  - the listing is `available` and not the customer's own;
  - `start_date ≥ today + 4` and `end_date > start_date`;
  - `units` is between 1 and the units free on those dates (`AvailabilityService`);
  - the customer is not blocked by an overdue rental (W7 rule).

Response `201`: the rental object (`status: "requested"`, `respond_by` set).
It notifies the renting party.

Errors:
- 422 `fields`: `start_date`, `end_date`, `units`, `logistics`, `address_line1`,
  `city`, `district`, `contact_name`, `contact_phone`, `notes`, `agree_terms`.
- 409 "Those dates are no longer available": the units were taken between the
  quote and the submit.
- 404: the listing is gone.

#### `GET /customer/rentals`: my rentals (W2)
Query: `tab=response|payment|active|completed|cancelled` (optional; omitted =
all), plus the usual `ListQuery` paging (`page`, `per_page`).
Response `200`
```json
{ "items": [ /* rental objects */ ],
  "counts": { "all": 9, "response": 2, "payment": 2, "active": 3, "completed": 1, "cancelled": 1 },
  "page": 1, "per_page": 10, "total": 9, "total_pages": 1 }
```
Newest first. `counts` fill the tab badges.

#### `GET /customer/rentals/{id}`: one rental (W2)
Response `200`: a rental object plus `"history"`, the log rows oldest first:
`[{ "from_status": null, "to_status": "requested", "by": "customer", "note": null, "at": "…" }]`.
`by` is `customer`, `renting_party`, `delivery_personnel`, `admin` or
`system`, never a user id.

#### `POST /customer/rentals/{id}/cancel`: withdraw a request (W2)
Request `{ "reason": "Plans changed" }` (required, at most 255 characters).
Only while `requested`. Response `200`: the rental object (`cancelled`). It
notifies the renting party. Errors: 409 when the status isn't `requested`
(already decided or expired), 422 `fields.reason`.

#### Agreement (W3, body built by Rangajeewa's `AgreementService`)
| Method and path | Request | Response | Notes |
|---|---|---|---|
| `GET /customer/rentals/{id}/agreement` | — | `{ "body": "…", "body_sha256": "…", "signed_at": null, "signed_by_name": null }` | From `accepted` onward |
| `POST /customer/rentals/{id}/agreement/otp` | — | `{ "sent_to": "n***@example.lk", "expires_at": "…" }` | Emails a 6-digit code; stores only its hash; throttled |
| `POST /customer/rentals/{id}/agreement/sign` | `{ "otp": "123456", "agree": true }` | the rental object (`agreement_signed`) | Records time, user and IP. 409 when the OTP is wrong, expired, or used too many times |

#### Payment (W3–4, Peiris)
The Payment page gets the amount from the rental object (`price.total_lkr`)
and starts checkout with Peiris's `POST /payments/checkout`
`{ "purpose": "rental", "rental_id": 42 }`. That is only allowed while
`agreement_signed` and before `pay_by`. The status becomes `paid` only from the
PayHere callback, never from the page.

#### Later weeks (paths fixed now, shapes in that week's contract update)
| Week | Endpoint |
|---|---|
| W5 | `GET /customer/rentals/{id}/inspection` (pre-handover), `POST …/inspection/acknowledge`, `GET …/handover-code` |
| W6 | `POST /customer/rentals/{id}/return-logistics` `{ "return_logistics": "self_return" \| "platform_return" }`, `GET …/damage-claim`, `POST …/damage-claim/accept`, `POST …/damage-claim/dispute` |
| W7 | `POST /customer/rentals/{id}/change-requests` `{ "type": "extension" \| "early_return", "requested_end_date", "reason" }` |

### B.4 Renting party endpoints (role `renting_party`, Rangajeewa builds W2)

Every query is scoped to `equipment.owner_id = session user`.

| Method and path | Request | Response | Errors |
|---|---|---|---|
| `GET /renting-party/rentals?status=response\|payment\|confirmed\|rejected\|expired` | — | `{ items, counts, page, per_page, total, total_pages }` like the customer list; the filter values are the A.5 column | — |
| `GET /renting-party/rentals/{id}` | — | rental object + `history` | 404 |
| `POST /renting-party/rentals/{id}/accept` | — | rental object (`accepted`, `pay_by` set) | 409 not `requested`, past `respond_by`, or the units are no longer free |
| `POST /renting-party/rentals/{id}/reject` | `{ "reason": "Not available on these dates" \| "Under maintenance" \| "Other", "message": "optional, ≤255" }` | rental object (`rejected`; `reject_reason` = reason, plus `: message` when given) | 409, 422 `fields.reason` |

Accepting is one transaction (`RentalService::accept()`), with these steps:
1. re-check availability;
2. set the status and `pay_by`;
3. write the log row;
4. generate the agreement (W3);
5. notify the customer.

### B.5 Wishlist (role `customer`, Vidmantha builds W2)

| Method and path | Request | Response | Errors |
|---|---|---|---|
| `GET /wishlist` | — | `[{ "equipment_id", "title", "photo_url", "daily_rate_lkr", "district", "owner_name", "status", "saved_at" }]`, newest first. `status` is the listing's, so a retired or `maintenance` one shows as Unavailable | — |
| `GET /wishlist/ids` | — | `[7, 12, 31]`, for the hearts on Browsing and Detailed | — |
| `POST /wishlist` | `{ "equipment_id": 7 }` | `201 { "equipment_id": 7, "saved": true }`; saving again returns `200`, the same body | 404 listing missing or retired |
| `DELETE /wishlist/{equipmentId}` | — | `{ "equipment_id": 7, "saved": false }`; removing an item that isn't saved is not an error | — |

### B.6 Routes block for `backend/routes.php`

```php
// Rentals: customer side (Vidmantha). Owner side is the block below.
$router->add('POST', '/customer/rentals/quote',       [RentalController::class, 'quote'],  ['customer']);
$router->add('GET',  '/customer/rentals',             [RentalController::class, 'index'],  ['customer']);
$router->add('POST', '/customer/rentals',             [RentalController::class, 'store'],  ['customer']);
$router->add('GET',  '/customer/rentals/{id}',        [RentalController::class, 'show'],   ['customer']);
$router->add('POST', '/customer/rentals/{id}/cancel', [RentalController::class, 'cancel'], ['customer']);

// Wishlist (Vidmantha)
$router->add('GET',    '/wishlist',               [WishlistController::class, 'index'],   ['customer']);
$router->add('GET',    '/wishlist/ids',           [WishlistController::class, 'ids'],     ['customer']);
$router->add('POST',   '/wishlist',               [WishlistController::class, 'store'],   ['customer']);
$router->add('DELETE', '/wishlist/{equipmentId}', [WishlistController::class, 'destroy'], ['customer']);

// Rentals: renting party side (Rangajeewa)
$router->add('GET',  '/renting-party/rentals',             [RentingPartyRentalController::class, 'index'],  ['renting_party']);
$router->add('GET',  '/renting-party/rentals/{id}',        [RentingPartyRentalController::class, 'show'],   ['renting_party']);
$router->add('POST', '/renting-party/rentals/{id}/accept', [RentingPartyRentalController::class, 'accept'], ['renting_party']);
$router->add('POST', '/renting-party/rentals/{id}/reject', [RentingPartyRentalController::class, 'reject'], ['renting_party']);
```

Shared backend pieces:
- **`RentalModel`:** the only SQL on `rentals` and `rental_status_log`.
  Vidmantha and Rangajeewa pair on it in W2.
- **`RentalService`:** `place()`, `cancel()`, `accept()`, `reject()`,
  `expireOverdueDeadlines()`, plus the private `transition($rental, $to,
  $actorId, $note)`. That helper writes the status, the `*_at` column, and
  the log row together.
- **`RentalController::present()`:** builds the B.2 object for both
  controllers.

---

## Part C — Schema notes for the other Week 1 owners

- **`rentals.rental_id`** is the FK target for:
  - `rental_agreements`, `handover_codes`, `inspections`, `damage_claims`,
    `rental_change_requests` (Rangajeewa);
  - `deliveries` (Dishanthan);
  - `payments`, `deposit_ledger` (Peiris).
- **`rental_ref`** is set by `RentalModel` right after the INSERT, in the same
  transaction: `CONCAT('RQ-', LPAD(rental_id, 6, '0'))`.
- **055 `reviews`** expects these primary keys:
  - `deliveries.delivery_id` (041);
  - `maintenance_requests.request_id` (040).

  Tell Vidmantha if either name changes.
- **MariaDB 10.4 pitfall** (`explicit_defaults_for_timestamp = OFF`): the
  first `TIMESTAMP NOT NULL` column in a table that has no explicit DEFAULT
  silently gets `DEFAULT current_timestamp() ON UPDATE current_timestamp()`.
  So declare every deadline or event time `TIMESTAMP NULL DEFAULT NULL`, and
  check with `SHOW CREATE TABLE`. The existing `028.password_resets.expires_at`
  has this problem: it resets to "now" on every UPDATE of the row.
- **Strict mode:** the app connects with strict SQL mode (`db_config.php`),
  so a bad ENUM value is an error there. The `mysql` CLI is not strict by
  default, and quietly stores `''` instead.
