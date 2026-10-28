-- schema/dump/demo_full.sql
-- Demo data for the whole platform: one ready-to-use account for every role
-- plus a few equipment listings. This is the FIRST version (Week 1); every
-- week adds the rows its module needs (rentals in each state, deliveries,
-- reviews, ...) so that by Week 10 a fresh database shows every page with
-- something on it.
--
-- Like jobs_and_bids.sql this is DEMO data, not schema and not reference
-- data: nothing in the application depends on it, it is not part of the
-- numbered build, and a clean deployment skips it. Run it by hand after the
-- migrations:
--
--     "/c/xampp/mysql/bin/mysql.exe" -u root equipify < schema/dump/demo_full.sql
--
-- It needs every migration up to 033_create_rental_status_log.sql applied.
--
-- Every account below uses the same password: Demo2026
--
--     Admin               demo.admin@equipify.test
--     Area manager        demo.areamanager@equipify.test   (registered by the demo admin)
--     Delivery personnel  demo.delivery@equipify.test      (registered by the demo area manager)
--     Technician          demo.technician@equipify.test    (registered by the demo area manager)
--     Customer            demo.customer@equipify.test
--     Renting party       demo.rentingparty@equipify.test  (verified, owns the listings below)
--     Freelance worker    demo.freelancer@equipify.test    (verified, so it can bid)
--
-- Re-running the file is safe: section 0 deletes exactly these accounts
-- (and the listings the demo renting party owns) before creating them again.
-- No other account is read or written. The deletes run in foreign-key order,
-- because several FKs are ON DELETE RESTRICT: listings before their owner,
-- staff before the area manager who registered them, the area manager before
-- the admin.
--
-- area_id is not set on the staff yet; that column arrives with 030 and the
-- demo areas are added here in Week 2.

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------
-- 0. Clean up a previous run of this file.

SET @old_rp = (SELECT user_id FROM users WHERE email = 'demo.rentingparty@equipify.test');

DELETE FROM wishlists WHERE equipment_id IN (SELECT equipment_id FROM equipment WHERE owner_id = @old_rp);
DELETE FROM equipment WHERE owner_id = @old_rp;

DELETE FROM users WHERE email IN ('demo.delivery@equipify.test', 'demo.technician@equipify.test');
DELETE FROM users WHERE email = 'demo.areamanager@equipify.test';
DELETE FROM users
 WHERE email IN (
     'demo.admin@equipify.test',
     'demo.customer@equipify.test',
     'demo.rentingparty@equipify.test',
     'demo.freelancer@equipify.test'
 );

-- bcrypt of "Demo2026", shared by every account below.
SET @pw = '$2y$10$p9GqmEpd8U.KKvHdxZhHGus1Nq6fpMomxXggsr4BmbH75EneCW7d6';

-- ----------------------------------------------------------------------
-- 1. Admin

INSERT INTO users (email, password_hash, role, full_name, phone, district) VALUES
    ('demo.admin@equipify.test', @pw, 'admin', 'Demo Admin', '+94709000001', 'Colombo');
SET @admin = LAST_INSERT_ID();
INSERT INTO admins (user_id) VALUES (@admin);

-- ----------------------------------------------------------------------
-- 2. Area manager, and the field staff they registered

INSERT INTO users (email, password_hash, role, full_name, phone, nic_number, address_line, district) VALUES
    ('demo.areamanager@equipify.test', @pw, 'area_manager', 'Chamara Wickramasinghe', '+94709000002', '198812300002', '18 Galle Road', 'Colombo');
SET @am = LAST_INSERT_ID();
INSERT INTO area_managers (user_id, registered_by) VALUES (@am, @admin);

INSERT INTO users (email, password_hash, role, full_name, phone, nic_number, address_line, district) VALUES
    ('demo.delivery@equipify.test', @pw, 'delivery_personnel', 'Sunil Ranasinghe', '+94709000003', '199011200003', '7 High Level Road', 'Colombo');
SET @dp = LAST_INSERT_ID();
INSERT INTO delivery_personnel (user_id, registered_by, driving_license_no, license_class, license_expiry) VALUES
    (@dp, @am, 'DEMO000003', 'B', DATE_ADD(CURDATE(), INTERVAL 3 YEAR));

INSERT INTO users (email, password_hash, role, full_name, phone, nic_number, address_line, district) VALUES
    ('demo.technician@equipify.test', @pw, 'maintenance_tech', 'Pradeep Kumara', '+94709000004', '198705600004', '22 Kandy Road', 'Gampaha');
SET @tech = LAST_INSERT_ID();
INSERT INTO maintenance_techs (user_id, registered_by, bio, years_experience, specialization) VALUES
    (@tech, @am, 'Diesel engines and hydraulics on earthmoving plant and generators.', 9, 'Hydraulics and diesel engines');
INSERT INTO maintenance_tech_categories (user_id, category_id)
SELECT @tech, category_id FROM equipment_categories
 WHERE slug IN ('earthmoving-road-works', 'power-air-lighting');

-- ----------------------------------------------------------------------
-- 3. Customer

INSERT INTO users (email, password_hash, role, full_name, phone, nic_number, address_line, district) VALUES
    ('demo.customer@equipify.test', @pw, 'customer', 'Nimal Perera', '+94709000005', '198523400005', '42 Temple Road, Maharagama', 'Colombo');
SET @cust = LAST_INSERT_ID();
INSERT INTO customers (user_id, company_name, billing_address) VALUES
    (@cust, 'Perera Builders (Pvt) Ltd', '42 Temple Road, Maharagama');

-- ----------------------------------------------------------------------
-- 4. Renting party (verified) and its listings

INSERT INTO users (email, password_hash, role, full_name, phone, nic_number, address_line, district) VALUES
    ('demo.rentingparty@equipify.test', @pw, 'renting_party', 'Kasun Jayawardena', '+94709000006', '198067800006', '120 Negombo Road, Wattala', 'Gampaha');
SET @rp = LAST_INSERT_ID();
INSERT INTO renting_parties (user_id, business_name, business_reg_no, business_address, district, description, verification_status) VALUES
    (@rp, 'Lanka Earthmovers', 'PV-DEMO-0006', '120 Negombo Road, Wattala', 'Gampaha',
     'Earthmoving, lifting and power equipment for contractors in the Western Province.', 'verified');

INSERT INTO equipment (owner_id, type_id, title, brand, model, year_made, serial_no, condition_grade, district, address, daily_rate_lkr, deposit_lkr, quantity, description)
SELECT @rp, type_id, 'CAT 320 Hydraulic Excavator', 'Caterpillar', '320', 2019, 'CAT0320DEMO01', 'good', 'Gampaha', '120 Negombo Road, Wattala',
       28000.00, 50000.00, 1, '20-tonne class excavator with a 1.0 m3 bucket. Operator not included.'
  FROM equipment_types WHERE slug = 'excavator';

INSERT INTO equipment (owner_id, type_id, title, brand, model, year_made, serial_no, condition_grade, district, address, daily_rate_lkr, deposit_lkr, quantity, description)
SELECT @rp, type_id, 'Bobcat S650 Skid-Steer Loader', 'Bobcat', 'S650', 2021, 'B3ZT11234', 'excellent', 'Gampaha', '120 Negombo Road, Wattala',
       12000.00, 25000.00, 2, 'Compact loader with bucket and pallet forks. Two identical units.'
  FROM equipment_types WHERE slug = 'skid-steer-loader';

INSERT INTO equipment (owner_id, type_id, title, brand, model, year_made, serial_no, condition_grade, district, address, daily_rate_lkr, deposit_lkr, quantity, description)
SELECT @rp, type_id, 'Perkins 100 kVA Diesel Generator', 'Perkins', '1104C-44TAG2', 2020, 'PK100DEMO03', 'good', 'Gampaha', '120 Negombo Road, Wattala',
       18000.00, 30000.00, 1, 'Silent canopy, 8 hours on a full tank at 75% load.'
  FROM equipment_types WHERE slug = 'diesel-generator';

INSERT INTO equipment (owner_id, type_id, title, brand, model, year_made, serial_no, condition_grade, district, address, daily_rate_lkr, deposit_lkr, quantity, description)
SELECT @rp, type_id, 'Genie GS-1930 Scissor Lift (19 ft)', 'Genie', 'GS-1930', 2018, 'GS30DEMO04', 'fair', 'Gampaha', '120 Negombo Road, Wattala',
       7500.00, 20000.00, 3, 'Electric scissor lift for indoor work, 227 kg platform capacity.'
  FROM equipment_types WHERE slug = 'scissor-lift';

-- ----------------------------------------------------------------------
-- 5. Freelance worker (verified)

INSERT INTO users (email, password_hash, role, full_name, phone, nic_number, address_line, district) VALUES
    ('demo.freelancer@equipify.test', @pw, 'freelance_worker', 'Ruwan Fernando', '+94709000007', '199234500007', '5 Station Road, Kelaniya', 'Gampaha');
SET @fw = LAST_INSERT_ID();
INSERT INTO freelance_workers (user_id, bio, years_experience, verification_status) VALUES
    (@fw, 'Licensed excavator and backhoe operator, mostly road and foundation work.', 7, 'verified');

-- ----------------------------------------------------------------------
-- 6. The demo customer has saved two of the listings.

INSERT INTO wishlists (customer_id, equipment_id)
SELECT @cust, equipment_id FROM equipment
 WHERE owner_id = @rp AND title IN ('CAT 320 Hydraulic Excavator', 'Perkins 100 kVA Diesel Generator');
