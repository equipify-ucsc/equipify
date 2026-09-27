-- schema/dump/jobs_and_bids.sql
-- Demo data: customer job offers (JOB), the bids one operator placed on them
-- (JOB_BID) and the offers that operator declined (JOB_DECLINE).
--
-- This sits in schema/dump/ rather than in the numbered migrations because it
-- is DEMO data, not schema and not reference data. Nothing in the application
-- depends on these rows, it is not part of the ordered build, and a clean
-- deployment should skip it. Run it by hand, after the migrations, when you
-- want the freelance worker's Job Offers page and dashboard to have something
-- to show:
--
--     mysql -u root -p equipify < schema/dump/jobs_and_bids.sql
--
-- It needs every migration up to 016_create_job_declines.sql applied first.
--
-- Three demo customers are created here and own every job below, so re-running
-- the file is safe: it deletes those three users first and the FK cascades from
-- 014/015/016 take their jobs, bids and declines with them. Jobs posted by any
-- other customer -- including cust@example.lk -- are never touched.
--
-- It also marks nuwan@example.lk verified, because only verified operators may
-- bid.
--
-- Every bid and decline here belongs to nuwan@example.lk and to nobody else:
-- no other operator's account is read or written, so the other registered
-- freelance workers see only the plain open offers. He is looked up by email
-- rather than by id, so the file does not depend on the order accounts were
-- registered in. The mix below gives him at least one offer in each of the
-- four states the Job Offers page derives (open, accepted, declined, expired),
-- at least one bid in each of the four bid states, and enough of both to fill
-- more than one page of the 8-per-page pager.
--
-- All dates are relative to CURDATE() so the data does not go stale: an offer
-- reads as "expired" because its start date has passed, which has to stay true
-- next month as well.

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------
-- 0. Clean up a previous run of this file.

DELETE FROM users
 WHERE email IN (
     'lanka.constructions@example.lk',
     'ceylon.earthworks@example.lk',
     'port.projects@example.lk'
 );

-- ----------------------------------------------------------------------
-- 1. The operator these jobs are aimed at (already registered).

SET @nuwan = (SELECT user_id FROM users WHERE email = 'nuwan@example.lk');

-- Bidding is limited to verified operators (JobOfferController::placeBid), and
-- an admin would normally do this after checking his documents. Without it the
-- bids below would describe a state the application cannot produce, and the
-- demo account could not place a new one.
UPDATE freelance_workers SET verification_status = 'verified' WHERE user_id = @nuwan;

-- ----------------------------------------------------------------------
-- 2. Three demo customers. Password for all three: Customer123

INSERT INTO users (email, password_hash, role, full_name, phone, nic_number, address_line, district) VALUES
    ('lanka.constructions@example.lk', '$2y$10$BVBN1woJb8VTUFIXC.wTQe6kscCUVVFfdzQWbiUJOC62s0m1pmhXK', 'customer', 'Ranjith Weerasinghe', '+94112550101', '198234500101', '45 Baseline Road', 'Colombo');
SET @cust_lanka = LAST_INSERT_ID();
INSERT INTO customers (user_id, company_name, billing_address) VALUES
    (@cust_lanka, 'Lanka Constructions (Pvt) Ltd', '45 Baseline Road, Colombo 09');

INSERT INTO users (email, password_hash, role, full_name, phone, nic_number, address_line, district) VALUES
    ('ceylon.earthworks@example.lk', '$2y$10$BVBN1woJb8VTUFIXC.wTQe6kscCUVVFfdzQWbiUJOC62s0m1pmhXK', 'customer', 'Dilani Jayasuriya', '+94812550202', '199145600202', '12 Peradeniya Road', 'Kandy');
SET @cust_ceylon = LAST_INSERT_ID();
INSERT INTO customers (user_id, company_name, billing_address) VALUES
    (@cust_ceylon, 'Ceylon Earthworks', '12 Peradeniya Road, Kandy');

INSERT INTO users (email, password_hash, role, full_name, phone, nic_number, address_line, district) VALUES
    ('port.projects@example.lk', '$2y$10$BVBN1woJb8VTUFIXC.wTQe6kscCUVVFfdzQWbiUJOC62s0m1pmhXK', 'customer', 'Mahesh Gunaratne', '+94472550303', '198756700303', '3 Harbour Access Road', 'Hambantota');
SET @cust_port = LAST_INSERT_ID();
INSERT INTO customers (user_id, company_name, billing_address) VALUES
    (@cust_port, 'Hambantota Port Projects', '3 Harbour Access Road, Hambantota');

-- ----------------------------------------------------------------------
-- 3. Jobs.
--
-- Each is inserted on its own so the new job_id can be captured for the bids
-- below. The comment on each says which state it produces for Nuwan; that
-- state is derived in JobModel::offersQuery(), never stored.

-- 3a. Open, nobody from this demo has bid or declined -> "Open" for everyone.
INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_lanka, 'Excavator operator for foundation dig', 'Excavator', 'Bulk excavation for a six-storey foundation. Night shifts possible.', 'Colombo', 'Baseline Road Tower Site', DATE_ADD(CURDATE(), INTERVAL 6 DAY), DATE_ADD(CURDATE(), INTERVAL 13 DAY), 96000.00, 'open', DATE_SUB(NOW(), INTERVAL 3 DAY));
SET @j1 = LAST_INSERT_ID();

INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_ceylon, 'Bulldozer operator for site levelling', 'Bulldozer', 'Levelling 2.5 acres ahead of a warehouse pour.', 'Kandy', 'Katugastota Warehouse Site', DATE_ADD(CURDATE(), INTERVAL 9 DAY), DATE_ADD(CURDATE(), INTERVAL 16 DAY), 84000.00, 'open', DATE_SUB(NOW(), INTERVAL 2 DAY));
SET @j2 = LAST_INSERT_ID();

INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_port, 'Mobile crane operator, jetty steelwork', 'Mobile Crane', 'Lifting pre-fabricated steel sections onto the jetty deck.', 'Hambantota', 'Hambantota Port Jetty 3', DATE_ADD(CURDATE(), INTERVAL 11 DAY), DATE_ADD(CURDATE(), INTERVAL 21 DAY), 165000.00, 'open', DATE_SUB(NOW(), INTERVAL 5 DAY));
SET @j3 = LAST_INSERT_ID();

INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_lanka, 'Road roller operator for access road', 'Road Roller', 'Compaction of a 1.8 km site access road.', 'Gampaha', 'Kadawatha Access Road', DATE_ADD(CURDATE(), INTERVAL 4 DAY), DATE_ADD(CURDATE(), INTERVAL 10 DAY), 62000.00, 'open', DATE_SUB(NOW(), INTERVAL 1 DAY));
SET @j4 = LAST_INSERT_ID();

-- 3b. Open, and Nuwan has an undecided bid on them -> still "Open", and they
--     also fill his My bids tab.
INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_ceylon, 'Backhoe loader operator, drainage trenches', 'Backhoe Loader', 'Trenching for storm water drains along the estate road.', 'Matale', 'Rattota Estate Road', DATE_ADD(CURDATE(), INTERVAL 7 DAY), DATE_ADD(CURDATE(), INTERVAL 12 DAY), 58000.00, 'open', DATE_SUB(NOW(), INTERVAL 6 DAY));
SET @j5 = LAST_INSERT_ID();

INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_lanka, 'Telehandler operator for material handling', 'Telehandler', 'Moving block and formwork on a live high-rise site.', 'Colombo', 'Dematagoda Residences', DATE_ADD(CURDATE(), INTERVAL 5 DAY), DATE_ADD(CURDATE(), INTERVAL 19 DAY), 118000.00, 'open', DATE_SUB(NOW(), INTERVAL 4 DAY));
SET @j6 = LAST_INSERT_ID();

INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_port, 'Wheel loader operator, aggregate yard', 'Wheel Loader', 'Feeding the crusher from the aggregate stockpile.', 'Hambantota', 'Sooriyawewa Aggregate Yard', DATE_ADD(CURDATE(), INTERVAL 8 DAY), DATE_ADD(CURDATE(), INTERVAL 15 DAY), 74000.00, 'open', DATE_SUB(NOW(), INTERVAL 7 DAY));
SET @j7 = LAST_INSERT_ID();

INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_ceylon, 'Motor grader operator for estate roads', 'Motor Grader', 'Re-grading 4 km of gravel estate roads before the monsoon.', 'Nuwara Eliya', 'Labukele Estate', DATE_ADD(CURDATE(), INTERVAL 12 DAY), DATE_ADD(CURDATE(), INTERVAL 18 DAY), 91000.00, 'open', DATE_SUB(NOW(), INTERVAL 2 DAY));
SET @j8 = LAST_INSERT_ID();

INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_lanka, 'Concrete pump operator for raft pour', 'Concrete Pump', 'Continuous 14-hour raft pour. Experience with boom pumps required.', 'Kalutara', 'Panadura Mixed-Use Site', DATE_ADD(CURDATE(), INTERVAL 10 DAY), DATE_ADD(CURDATE(), INTERVAL 11 DAY), 46000.00, 'open', DATE_SUB(NOW(), INTERVAL 8 DAY));
SET @j9 = LAST_INSERT_ID();

INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_port, 'Dump truck operator, spoil haulage', 'Dump Truck', 'Hauling excavated spoil to the licensed tip 9 km away.', 'Galle', 'Karapitiya Hospital Extension', DATE_ADD(CURDATE(), INTERVAL 14 DAY), DATE_ADD(CURDATE(), INTERVAL 24 DAY), 102000.00, 'open', DATE_SUB(NOW(), INTERVAL 9 DAY));
SET @j10 = LAST_INSERT_ID();

-- 3c. Open, and Nuwan's bid has been shortlisted by the customer -> "Open"
--     here, "Shortlisted" in his My bids tab.
INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_ceylon, 'Tower crane operator, 12-week programme', 'Tower Crane', 'Full programme on a hospital block. Valid tower crane licence required.', 'Kurunegala', 'Kurunegala Hospital Block C', DATE_ADD(CURDATE(), INTERVAL 20 DAY), DATE_ADD(CURDATE(), INTERVAL 104 DAY), 890000.00, 'open', DATE_SUB(NOW(), INTERVAL 11 DAY));
SET @j11 = LAST_INSERT_ID();

-- 3d. Start date already passed -> "Expired".
INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_lanka, 'Skid steer operator for yard clearance', 'Skid Steer Loader', 'Clearing and sorting the contractor yard after handover.', 'Gampaha', 'Ja-Ela Contractor Yard', DATE_SUB(CURDATE(), INTERVAL 6 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), 38000.00, 'open', DATE_SUB(NOW(), INTERVAL 21 DAY));
SET @j12 = LAST_INSERT_ID();

-- 3e. Cancelled after Nuwan bid -> "Expired" for him, and a "Lost" bid.
INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at, cancelled_at) VALUES
    (@cust_port, 'Boom lift operator for facade works', 'Boom Lift', 'Cancelled: the facade package was re-tendered.', 'Matara', 'Matara Commercial Complex', DATE_ADD(CURDATE(), INTERVAL 3 DAY), DATE_ADD(CURDATE(), INTERVAL 9 DAY), 54000.00, 'cancelled', DATE_SUB(NOW(), INTERVAL 18 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY));
SET @j13 = LAST_INSERT_ID();

-- 3f. Nuwan was hired -> "Accepted", and a "Won" bid.
INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, hired_worker_id, published_at, hired_at) VALUES
    (@cust_lanka, 'Excavator operator, basement dig', 'Excavator', 'Two-level basement excavation with shoring already in place.', 'Colombo', 'Union Place Office Tower', DATE_ADD(CURDATE(), INTERVAL 2 DAY), DATE_ADD(CURDATE(), INTERVAL 23 DAY), 245000.00, 'hired', @nuwan, DATE_SUB(NOW(), INTERVAL 16 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY));
SET @j14 = LAST_INSERT_ID();

INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, hired_worker_id, published_at, hired_at, completed_at) VALUES
    (@cust_ceylon, 'Forklift operator, warehouse fit-out', 'Forklift', 'Racking installation support over a two-week fit-out.', 'Kandy', 'Pallekele Distribution Centre', DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_SUB(CURDATE(), INTERVAL 16 DAY), 78000.00, 'completed', @nuwan, DATE_SUB(NOW(), INTERVAL 45 DAY), DATE_SUB(NOW(), INTERVAL 36 DAY), DATE_SUB(NOW(), INTERVAL 15 DAY));
SET @j15 = LAST_INSERT_ID();

-- 3g. Withdrawn after Nuwan bid -> "Expired" for him, and a second "Lost"
--     bid. The customer awarding the job to a rival would read the same way,
--     but that would mean seeding another operator's bid, which this file
--     deliberately does not do.
INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at, cancelled_at) VALUES
    (@cust_port, 'Concrete mixer truck driver, night pours', 'Concrete Mixer Truck', 'Withdrawn: the night pour programme was moved to the next dry season.', 'Hambantota', 'Hambantota Breakwater', DATE_ADD(CURDATE(), INTERVAL 1 DAY), DATE_ADD(CURDATE(), INTERVAL 17 DAY), 134000.00, 'cancelled', DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY));
SET @j16 = LAST_INSERT_ID();

-- 3h. Open, but Nuwan declined them -> "Declined" for him, open for everyone
--     else. He must not also have a bid on these: the API refuses that pair.
INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_ceylon, 'Air compressor operator for rock breaking', 'Air Compressor', 'Hand-held breaker work on a rock cutting.', 'Badulla', 'Ella Road Cutting', DATE_ADD(CURDATE(), INTERVAL 15 DAY), DATE_ADD(CURDATE(), INTERVAL 20 DAY), 41000.00, 'open', DATE_SUB(NOW(), INTERVAL 10 DAY));
SET @j17 = LAST_INSERT_ID();

INSERT INTO jobs (customer_id, title, equipment, description, district, site, start_date, end_date, budget_lkr, status, published_at) VALUES
    (@cust_port, 'Scissor lift operator, ceiling services', 'Scissor Lift', 'Ceiling services install in a finished retail unit.', 'Ratnapura', 'Ratnapura Retail Park', DATE_ADD(CURDATE(), INTERVAL 18 DAY), DATE_ADD(CURDATE(), INTERVAL 26 DAY), 49000.00, 'open', DATE_SUB(NOW(), INTERVAL 12 DAY));
SET @j18 = LAST_INSERT_ID();

-- ----------------------------------------------------------------------
-- 4. Bids.
--
-- Nuwan bids on ten jobs, which is more than one page of the My bids tab.
-- uq_job_bids_job_worker allows exactly one bid per worker per job. No other
-- operator bids here, so a customer's bid comparison shows his row alone.

INSERT INTO job_bids (job_id, worker_id, bid_amount_lkr, message, status, submitted_at) VALUES
    (@j5,  @nuwan, 55000.00,  'Available from the start date. Eight years on backhoe trenching, including storm water.', 'submitted',   DATE_SUB(NOW(), INTERVAL 5 DAY)),
    (@j6,  @nuwan, 112000.00, 'I have worked this site before and hold a current high-rise site induction.',            'submitted',   DATE_SUB(NOW(), INTERVAL 3 DAY)),
    (@j7,  @nuwan, 71500.00,  'Happy to work the crusher feed on a two-shift pattern.',                                 'submitted',   DATE_SUB(NOW(), INTERVAL 6 DAY)),
    (@j9,  @nuwan, 44000.00,  'Boom pump experience on raft pours up to 900 m3. Can start the night before.',           'submitted',   DATE_SUB(NOW(), INTERVAL 7 DAY)),
    (@j10, @nuwan, 98000.00,  'Own PPE and a clean heavy vehicle record. Price includes the full haulage programme.',   'submitted',   DATE_SUB(NOW(), INTERVAL 8 DAY)),
    (@j11, @nuwan, 865000.00, 'Licensed tower crane operator, twelve years. References from two hospital projects.',    'shortlisted', DATE_SUB(NOW(), INTERVAL 10 DAY)),
    (@j13, @nuwan, 52000.00,  'Available for the whole facade package.',                                                'lost',        DATE_SUB(NOW(), INTERVAL 17 DAY)),
    (@j14, @nuwan, 238000.00, 'Basement digs with shoring are my main work. Can mobilise within two days.',             'won',         DATE_SUB(NOW(), INTERVAL 15 DAY)),
    (@j15, @nuwan, 76000.00,  'Reach truck and counterbalance certified.',                                             'won',         DATE_SUB(NOW(), INTERVAL 44 DAY)),
    (@j16, @nuwan, 131000.00, 'Night work is no problem; I live fifteen minutes from the plant.',                       'lost',        DATE_SUB(NOW(), INTERVAL 13 DAY));

-- ----------------------------------------------------------------------
-- 5. Declines. Declining hides the job from this operator's open offers and
--    shows it as Declined; it stays open for everyone else.

INSERT INTO job_declines (job_id, worker_id, declined_at) VALUES
    (@j17, @nuwan, DATE_SUB(NOW(), INTERVAL 9 DAY)),
    (@j18, @nuwan, DATE_SUB(NOW(), INTERVAL 11 DAY));
