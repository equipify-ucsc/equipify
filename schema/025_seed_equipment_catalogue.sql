-- 025_seed_equipment_catalogue.sql
-- Seed data: the equipment catalogue (first data migration in the project).
--
-- 10 categories, each with at least 5 real equipment types plus one
-- is_other = 1 "Other ..." type, and each type's spec fields. Rules this data
-- follows (and CatalogueService enforces for admin edits): at most 3
-- is_filterable fields per type; options is a JSON array exactly for select /
-- multiselect fields; shared field_keys (power_source, operating_weight_t, ...)
-- mean the same thing in every type. Slugs are fixed so later migrations can
-- reference rows by slug instead of by auto-increment id.
--
-- Pricing is per day only and there is no operator-availability spec anywhere.

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------
-- 1. Earthmoving & Road Works
INSERT INTO equipment_categories (slug, name, icon, sort_order) VALUES ('earthmoving-road-works', 'Earthmoving & Road Works', 'construction', 10);
SET @category_id = LAST_INSERT_ID();

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'excavator', 'Excavator', 0, 10);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_t', 'Operating weight', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'undercarriage', 'Undercarriage', 'select', NULL, '["Tracked","Wheeled"]', 1, 1, 20),
    (@type_id, 'max_digging_depth_m', 'Max digging depth', 'number', 'm', NULL, 0, 1, 30),
    (@type_id, 'engine_power_kw', 'Engine power', 'number', 'kW', NULL, 0, 0, 40),
    (@type_id, 'bucket_capacity_m3', 'Bucket capacity', 'number', 'm³', NULL, 0, 0, 50),
    (@type_id, 'attachments', 'Attachments included', 'multiselect', NULL, '["Hydraulic breaker","Auger","Grapple","Extra buckets","Quick coupler"]', 0, 0, 60);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'mini-excavator', 'Mini Excavator', 0, 20);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_t', 'Operating weight', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'undercarriage', 'Undercarriage', 'select', NULL, '["Tracked","Wheeled"]', 0, 1, 20),
    (@type_id, 'max_digging_depth_m', 'Max digging depth', 'number', 'm', NULL, 0, 1, 30),
    (@type_id, 'bucket_capacity_m3', 'Bucket capacity', 'number', 'm³', NULL, 0, 0, 40),
    (@type_id, 'attachments', 'Attachments included', 'multiselect', NULL, '["Hydraulic breaker","Auger","Grapple","Extra buckets","Quick coupler"]', 0, 0, 50);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'backhoe-loader', 'Backhoe Loader', 0, 30);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_t', 'Operating weight', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'max_digging_depth_m', 'Max digging depth', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'four_wheel_drive', '4-wheel drive', 'boolean', NULL, NULL, 0, 1, 30),
    (@type_id, 'bucket_capacity_m3', 'Loader bucket capacity', 'number', 'm³', NULL, 0, 0, 40),
    (@type_id, 'engine_power_kw', 'Engine power', 'number', 'kW', NULL, 0, 0, 50);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'wheel-loader', 'Wheel Loader', 0, 40);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_t', 'Operating weight', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'bucket_capacity_m3', 'Bucket capacity', 'number', 'm³', NULL, 0, 1, 20),
    (@type_id, 'engine_power_kw', 'Engine power', 'number', 'kW', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'skid-steer-loader', 'Skid Steer Loader', 0, 50);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_t', 'Operating weight', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'rated_capacity_kg', 'Rated operating capacity', 'number', 'kg', NULL, 0, 1, 20),
    (@type_id, 'undercarriage', 'Undercarriage', 'select', NULL, '["Tracked","Wheeled"]', 0, 1, 30),
    (@type_id, 'attachments', 'Attachments included', 'multiselect', NULL, '["Hydraulic breaker","Auger","Grapple","Extra buckets","Quick coupler"]', 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'bulldozer', 'Bulldozer', 0, 60);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_t', 'Operating weight', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'blade_width_m', 'Blade width', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'engine_power_kw', 'Engine power', 'number', 'kW', NULL, 0, 0, 30),
    (@type_id, 'ripper', 'Rear ripper fitted', 'boolean', NULL, NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'motor-grader', 'Motor Grader', 0, 70);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_t', 'Operating weight', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'blade_width_m', 'Blade width', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'engine_power_kw', 'Engine power', 'number', 'kW', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'road-roller', 'Vibratory / Tandem Roller', 0, 80);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_t', 'Operating weight', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'drum_width_mm', 'Drum width', 'number', 'mm', NULL, 0, 1, 20),
    (@type_id, 'drum_type', 'Drum type', 'select', NULL, '["Smooth","Padfoot"]', 0, 1, 30),
    (@type_id, 'vibratory', 'Vibratory', 'boolean', NULL, NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'plate-compactor', 'Plate Compactor', 0, 90);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_kg', 'Operating weight', 'number', 'kg', NULL, 1, 1, 10),
    (@type_id, 'plate_width_mm', 'Plate width', 'number', 'mm', NULL, 0, 1, 20),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Diesel","Electric","Petrol"]', 0, 1, 30),
    (@type_id, 'centrifugal_force_kn', 'Centrifugal force', 'number', 'kN', NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'rammer', 'Rammer (Jumping Jack)', 0, 100);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_kg', 'Operating weight', 'number', 'kg', NULL, 1, 1, 10),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Petrol","Diesel"]', 0, 1, 20),
    (@type_id, 'impact_force_kn', 'Impact force', 'number', 'kN', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'asphalt-paver', 'Asphalt Paver', 0, 110);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'operating_weight_t', 'Operating weight', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'paving_width_m', 'Max paving width', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'undercarriage', 'Undercarriage', 'select', NULL, '["Tracked","Wheeled"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'other-earthmoving-road-works', 'Other Earthmoving & Road Works', 1, 999);

-- ----------------------------------------------------------------------
-- 2. Lifting & Access
INSERT INTO equipment_categories (slug, name, icon, sort_order) VALUES ('lifting-access', 'Lifting & Access', 'forklift', 20);
SET @category_id = LAST_INSERT_ID();

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'mobile-crane', 'Mobile Crane', 0, 10);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'max_lift_capacity_t', 'Max lifting capacity', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'max_boom_length_m', 'Max boom length', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'max_lift_height_m', 'Max lift height', 'number', 'm', NULL, 0, 1, 30),
    (@type_id, 'outriggers', 'Outriggers', 'boolean', NULL, NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'crawler-crane', 'Crawler Crane', 0, 20);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'max_lift_capacity_t', 'Max lifting capacity', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'max_boom_length_m', 'Max boom length', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'max_lift_height_m', 'Max lift height', 'number', 'm', NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'tower-crane', 'Tower Crane', 0, 30);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'max_lift_capacity_t', 'Max lifting capacity', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'max_lift_height_m', 'Max hook height', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'jib_length_m', 'Jib length', 'number', 'm', NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'forklift', 'Forklift', 0, 40);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'max_lift_capacity_t', 'Max lifting capacity', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'max_lift_height_m', 'Max lift height', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Diesel","Electric","LPG"]', 0, 1, 30),
    (@type_id, 'mast_type', 'Mast type', 'select', NULL, '["Duplex","Triplex","Quad"]', 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'telehandler', 'Telehandler', 0, 50);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'max_lift_capacity_t', 'Max lifting capacity', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'max_lift_height_m', 'Max lift height', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'max_reach_m', 'Max forward reach', 'number', 'm', NULL, 0, 0, 30),
    (@type_id, 'four_wheel_drive', '4-wheel drive', 'boolean', NULL, NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'chain-hoist', 'Chain Hoist', 0, 60);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'max_lift_capacity_t', 'Max lifting capacity', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'max_lift_height_m', 'Lift height', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Manual","Electric"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'scissor-lift', 'Scissor Lift', 0, 70);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'working_height_m', 'Working height', 'number', 'm', NULL, 1, 1, 10),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Electric","Diesel","Hybrid"]', 0, 1, 20),
    (@type_id, 'terrain', 'Terrain', 'select', NULL, '["Indoor (slab)","Rough terrain"]', 0, 1, 30),
    (@type_id, 'platform_capacity_kg', 'Platform capacity', 'number', 'kg', NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'boom-lift', 'Boom Lift', 0, 80);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'working_height_m', 'Working height', 'number', 'm', NULL, 1, 1, 10),
    (@type_id, 'horizontal_outreach_m', 'Horizontal outreach', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Electric","Diesel","Hybrid"]', 0, 1, 30),
    (@type_id, 'boom_type', 'Boom type', 'select', NULL, '["Articulating","Telescopic"]', 0, 0, 40),
    (@type_id, 'platform_capacity_kg', 'Platform capacity', 'number', 'kg', NULL, 0, 0, 50);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'mast-lift', 'Mast Lift', 0, 90);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'working_height_m', 'Working height', 'number', 'm', NULL, 1, 1, 10),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Electric","Manual"]', 0, 1, 20),
    (@type_id, 'platform_capacity_kg', 'Platform capacity', 'number', 'kg', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'aluminium-tower-ladder', 'Aluminium Tower / Ladder', 0, 100);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'working_height_m', 'Working height', 'number', 'm', NULL, 1, 1, 10),
    (@type_id, 'access_type', 'Type', 'select', NULL, '["Mobile tower","Extension ladder","Step ladder"]', 0, 1, 20),
    (@type_id, 'platform_size', 'Platform size', 'text', NULL, NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'other-lifting-access', 'Other Lifting & Access', 1, 999);

-- ----------------------------------------------------------------------
-- 3. Concrete & Building
INSERT INTO equipment_categories (slug, name, icon, sort_order) VALUES ('concrete-building', 'Concrete & Building', 'foundation', 30);
SET @category_id = LAST_INSERT_ID();

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'concrete-mixer', 'Concrete Mixer', 0, 10);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'drum_capacity_l', 'Drum capacity', 'number', 'L', NULL, 1, 1, 10),
    (@type_id, 'drive', 'Drive', 'select', NULL, '["Diesel","Electric","Petrol"]', 0, 1, 20),
    (@type_id, 'hopper', 'Loading hopper', 'boolean', NULL, NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'transit-mixer', 'Transit Mixer Truck', 0, 20);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'drum_capacity_m3', 'Drum capacity', 'number', 'm³', NULL, 1, 1, 10),
    (@type_id, 'axle_configuration', 'Axle configuration', 'select', NULL, '["4x2","6x4","8x4"]', 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'concrete-pump', 'Concrete Pump', 0, 30);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'pumping_output_m3h', 'Pumping output', 'number', 'm³/h', NULL, 1, 1, 10),
    (@type_id, 'max_vertical_reach_m', 'Max vertical reach', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'pump_type', 'Pump type', 'select', NULL, '["Boom pump","Line pump"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'poker-vibrator', 'Poker Vibrator', 0, 40);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'needle_diameter_mm', 'Needle diameter', 'number', 'mm', NULL, 1, 1, 10),
    (@type_id, 'drive', 'Drive', 'select', NULL, '["Diesel","Electric","Petrol"]', 0, 1, 20),
    (@type_id, 'hose_length_m', 'Hose length', 'number', 'm', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'power-trowel', 'Power Trowel', 0, 50);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'trowel_diameter_mm', 'Trowel diameter', 'number', 'mm', NULL, 1, 1, 10),
    (@type_id, 'drive', 'Drive', 'select', NULL, '["Diesel","Electric","Petrol"]', 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'block-machine', 'Block Machine', 0, 60);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'output_blocks_per_day', 'Output', 'number', 'blocks/day', NULL, 1, 1, 10),
    (@type_id, 'drive', 'Drive', 'select', NULL, '["Diesel","Electric","Petrol"]', 0, 1, 20),
    (@type_id, 'block_size', 'Block size', 'text', NULL, NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'scaffolding-set', 'Scaffolding Set', 0, 70);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'max_height_m', 'Max height', 'number', 'm', NULL, 1, 1, 10),
    (@type_id, 'coverage_area_m2', 'Coverage area', 'number', 'm²', NULL, 0, 1, 20),
    (@type_id, 'scaffold_type', 'System', 'select', NULL, '["Frame","Cuplock","Ringlock","Tube & clamp"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'formwork-props', 'Formwork / Props', 0, 80);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'prop_max_height_m', 'Max prop height', 'number', 'm', NULL, 1, 1, 10),
    (@type_id, 'material', 'Material', 'select', NULL, '["Steel","Aluminium","Plywood"]', 0, 1, 20),
    (@type_id, 'pieces_per_set', 'Pieces per set', 'number', NULL, NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'bar-bender-cutter', 'Bar Bender & Cutter', 0, 90);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'max_bar_diameter_mm', 'Max bar diameter', 'number', 'mm', NULL, 1, 1, 10),
    (@type_id, 'function', 'Function', 'select', NULL, '["Bending","Cutting","Bending & cutting"]', 0, 1, 20),
    (@type_id, 'drive', 'Drive', 'select', NULL, '["Electric","Manual"]', 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'other-concrete-building', 'Other Concrete & Building', 1, 999);

-- ----------------------------------------------------------------------
-- 4. Power, Air & Lighting
INSERT INTO equipment_categories (slug, name, icon, sort_order) VALUES ('power-air-lighting', 'Power, Air & Lighting', 'bolt', 40);
SET @category_id = LAST_INSERT_ID();

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'diesel-generator', 'Diesel Generator', 0, 10);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'power_output_kva', 'Power output', 'number', 'kVA', NULL, 1, 1, 10),
    (@type_id, 'phase', 'Phase', 'select', NULL, '["Single-phase","Three-phase"]', 1, 1, 20),
    (@type_id, 'silent_canopy', 'Silent canopy', 'boolean', NULL, NULL, 0, 1, 30),
    (@type_id, 'fuel_tank_l', 'Fuel tank', 'number', 'L', NULL, 0, 0, 40),
    (@type_id, 'run_time_h', 'Run time at 75% load', 'number', 'h', NULL, 0, 0, 50);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'portable-generator', 'Portable Generator', 0, 20);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'power_output_kva', 'Power output', 'number', 'kVA', NULL, 1, 1, 10),
    (@type_id, 'fuel_type', 'Fuel type', 'select', NULL, '["Petrol","Diesel","LPG"]', 0, 1, 20),
    (@type_id, 'phase', 'Phase', 'select', NULL, '["Single-phase","Three-phase"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'air-compressor', 'Air Compressor', 0, 30);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'air_delivery_cfm', 'Air delivery', 'number', 'CFM', NULL, 1, 1, 10),
    (@type_id, 'max_pressure_bar', 'Max pressure', 'number', 'bar', NULL, 0, 1, 20),
    (@type_id, 'drive', 'Drive', 'select', NULL, '["Diesel","Electric"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'lighting-tower', 'Lighting Tower', 0, 40);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'total_output_w', 'Total light output', 'number', 'W', NULL, 1, 1, 10),
    (@type_id, 'lamp_count', 'Number of lamps', 'number', NULL, NULL, 0, 1, 20),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Diesel","Solar","Mains electric"]', 0, 1, 30),
    (@type_id, 'mast_height_m', 'Mast height', 'number', 'm', NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'solar-power-unit', 'Solar Power Unit', 0, 50);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'output_kw', 'Output', 'number', 'kW', NULL, 1, 1, 10),
    (@type_id, 'battery_capacity_kwh', 'Battery capacity', 'number', 'kWh', NULL, 0, 1, 20),
    (@type_id, 'phase', 'Phase', 'select', NULL, '["Single-phase","Three-phase"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'transformer-distribution-board', 'Transformer / Distribution Board', 0, 60);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'capacity_kva', 'Capacity', 'number', 'kVA', NULL, 1, 1, 10),
    (@type_id, 'phase', 'Phase', 'select', NULL, '["Single-phase","Three-phase"]', 0, 1, 20),
    (@type_id, 'output_voltage', 'Output voltage', 'text', NULL, NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'other-power-air-lighting', 'Other Power, Air & Lighting', 1, 999);

-- ----------------------------------------------------------------------
-- 5. Vehicles & Transport
INSERT INTO equipment_categories (slug, name, icon, sort_order) VALUES ('vehicles-transport', 'Vehicles & Transport', 'local_shipping', 50);
SET @category_id = LAST_INSERT_ID();

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'tipper-truck', 'Tipper Truck', 0, 10);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'payload_t', 'Payload', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'body_capacity_m3', 'Body capacity', 'number', 'm³', NULL, 0, 1, 20),
    (@type_id, 'fuel_type', 'Fuel type', 'select', NULL, '["Diesel","Petrol"]', 0, 1, 30),
    (@type_id, 'axle_configuration', 'Axle configuration', 'select', NULL, '["4x2","6x4","8x4"]', 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'dump-truck', 'Dump Truck', 0, 20);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'payload_t', 'Payload', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'body_capacity_m3', 'Body capacity', 'number', 'm³', NULL, 0, 1, 20),
    (@type_id, 'dump_type', 'Type', 'select', NULL, '["Rigid","Articulated"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'lorry', 'Lorry', 0, 30);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'payload_t', 'Payload', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'body_type', 'Body type', 'select', NULL, '["Open","Closed","Flatbed"]', 0, 1, 20),
    (@type_id, 'body_length_ft', 'Body length', 'number', 'ft', NULL, 0, 1, 30),
    (@type_id, 'fuel_type', 'Fuel type', 'select', NULL, '["Diesel","Petrol"]', 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'lowbed-trailer', 'Lowbed Trailer', 0, 40);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'payload_t', 'Payload', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'deck_length_m', 'Deck length', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'axle_count', 'Number of axles', 'number', NULL, NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'water-bowser', 'Water Bowser', 0, 50);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'tank_capacity_l', 'Tank capacity', 'number', 'L', NULL, 1, 1, 10),
    (@type_id, 'has_pump', 'Pump & spray bar', 'boolean', NULL, NULL, 0, 1, 20),
    (@type_id, 'fuel_type', 'Fuel type', 'select', NULL, '["Diesel","Petrol"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'fuel-bowser', 'Fuel Bowser', 0, 60);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'tank_capacity_l', 'Tank capacity', 'number', 'L', NULL, 1, 1, 10),
    (@type_id, 'has_dispenser', 'Metered dispenser', 'boolean', NULL, NULL, 0, 1, 20),
    (@type_id, 'fuel_type', 'Vehicle fuel type', 'select', NULL, '["Diesel","Petrol"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'van', 'Van', 0, 70);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'seats', 'Seats', 'number', NULL, NULL, 1, 1, 10),
    (@type_id, 'fuel_type', 'Fuel type', 'select', NULL, '["Diesel","Petrol","Hybrid","Electric"]', 0, 1, 20),
    (@type_id, 'air_conditioned', 'Air conditioned', 'boolean', NULL, NULL, 0, 1, 30),
    (@type_id, 'payload_t', 'Payload', 'number', 't', NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'bus', 'Bus', 0, 80);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'seats', 'Seats', 'number', NULL, NULL, 1, 1, 10),
    (@type_id, 'fuel_type', 'Fuel type', 'select', NULL, '["Diesel","Petrol"]', 0, 1, 20),
    (@type_id, 'air_conditioned', 'Air conditioned', 'boolean', NULL, NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'refrigerated-truck', 'Refrigerated Truck', 0, 90);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'payload_t', 'Payload', 'number', 't', NULL, 1, 1, 10),
    (@type_id, 'min_temperature_c', 'Lowest temperature', 'number', '°C', NULL, 0, 1, 20),
    (@type_id, 'body_length_ft', 'Body length', 'number', 'ft', NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'other-vehicles-transport', 'Other Vehicles & Transport', 1, 999);

-- ----------------------------------------------------------------------
-- 6. Tools & Instruments
INSERT INTO equipment_categories (slug, name, icon, sort_order) VALUES ('tools-instruments', 'Tools & Instruments', 'handyman', 60);
SET @category_id = LAST_INSERT_ID();

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'demolition-breaker', 'Demolition Hammer / Breaker', 0, 10);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Corded electric","Cordless (battery)","Petrol","Diesel","Compressed air"]', 1, 1, 10),
    (@type_id, 'impact_energy_j', 'Impact energy', 'number', 'J', NULL, 0, 1, 20),
    (@type_id, 'weight_kg', 'Weight', 'number', 'kg', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'core-drill', 'Core Drill', 0, 20);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Corded electric","Cordless (battery)","Petrol","Diesel","Compressed air"]', 1, 1, 10),
    (@type_id, 'max_drill_diameter_mm', 'Max core diameter', 'number', 'mm', NULL, 0, 1, 20),
    (@type_id, 'power_rating_w', 'Power rating', 'number', 'W', NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'concrete-tile-cutter', 'Concrete / Tile Cutter', 0, 30);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Corded electric","Cordless (battery)","Petrol","Diesel","Compressed air"]', 1, 1, 10),
    (@type_id, 'max_cut_depth_mm', 'Max cutting depth', 'number', 'mm', NULL, 0, 1, 20),
    (@type_id, 'blade_diameter_mm', 'Blade diameter', 'number', 'mm', NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'welding-machine', 'Welding Machine', 0, 40);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'welding_process', 'Process', 'select', NULL, '["Arc (MMA)","MIG","TIG"]', 1, 1, 10),
    (@type_id, 'max_current_a', 'Max current', 'number', 'A', NULL, 0, 1, 20),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Single-phase","Three-phase","Diesel","Petrol"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'water-pump', 'Water Pump', 0, 50);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Electric","Petrol","Diesel"]', 1, 1, 10),
    (@type_id, 'flow_rate_lpm', 'Flow rate', 'number', 'L/min', NULL, 0, 1, 20),
    (@type_id, 'outlet_size_in', 'Outlet size', 'number', 'in', NULL, 0, 1, 30),
    (@type_id, 'max_head_m', 'Max head', 'number', 'm', NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'chainsaw', 'Chainsaw', 0, 60);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Petrol","Corded electric","Cordless (battery)"]', 1, 1, 10),
    (@type_id, 'bar_length_in', 'Bar length', 'number', 'in', NULL, 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'total-station', 'Total Station', 0, 70);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'angular_accuracy_sec', 'Angular accuracy', 'number', 'sec', NULL, 1, 1, 10),
    (@type_id, 'range_m', 'Range with prism', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'reflectorless', 'Reflectorless', 'boolean', NULL, NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'auto-level', 'Auto Level', 0, 80);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'magnification_x', 'Magnification', 'number', '×', NULL, 1, 1, 10),
    (@type_id, 'accuracy_mm_km', 'Accuracy', 'number', 'mm/km', NULL, 0, 1, 20),
    (@type_id, 'tripod_included', 'Tripod & staff included', 'boolean', NULL, NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'laser-level', 'Laser Level', 0, 90);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'laser_type', 'Laser type', 'select', NULL, '["Line","Rotary","Dot"]', 1, 1, 10),
    (@type_id, 'working_range_m', 'Working range', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'self_levelling', 'Self-levelling', 'boolean', NULL, NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'pipe-threader', 'Pipe Threader', 0, 100);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'max_pipe_size_in', 'Max pipe size', 'number', 'in', NULL, 1, 1, 10),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Electric","Manual"]', 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'other-tools-instruments', 'Other Tools & Instruments', 1, 999);

-- ----------------------------------------------------------------------
-- 7. Agriculture
INSERT INTO equipment_categories (slug, name, icon, sort_order) VALUES ('agriculture', 'Agriculture', 'agriculture', 70);
SET @category_id = LAST_INSERT_ID();

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'four-wheel-tractor', '4-Wheel Tractor', 0, 10);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'engine_power_hp', 'Engine power', 'number', 'HP', NULL, 1, 1, 10),
    (@type_id, 'drive', 'Drive', 'select', NULL, '["2WD","4WD"]', 0, 1, 20),
    (@type_id, 'crop_type', 'Suitable for', 'multiselect', NULL, '["Paddy","Vegetable","Plantation","Other field crops"]', 0, 1, 30),
    (@type_id, 'implements_included', 'Implements included', 'multiselect', NULL, '["Plough","Rotavator","Disc harrow","Trailer","Cage wheels"]', 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'two-wheel-tractor', '2-Wheel Tractor (Hand Tractor)', 0, 20);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'engine_power_hp', 'Engine power', 'number', 'HP', NULL, 1, 1, 10),
    (@type_id, 'fuel_type', 'Fuel type', 'select', NULL, '["Diesel","Petrol"]', 0, 1, 20),
    (@type_id, 'crop_type', 'Suitable for', 'multiselect', NULL, '["Paddy","Vegetable","Plantation","Other field crops"]', 0, 1, 30),
    (@type_id, 'implements_included', 'Implements included', 'multiselect', NULL, '["Rotary tiller","Plough","Cage wheels","Trailer"]', 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'rotavator', 'Rotavator', 0, 30);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'working_width_m', 'Working width', 'number', 'm', NULL, 1, 1, 10),
    (@type_id, 'min_tractor_hp', 'Minimum tractor power', 'number', 'HP', NULL, 0, 1, 20),
    (@type_id, 'crop_type', 'Suitable for', 'multiselect', NULL, '["Paddy","Vegetable","Plantation","Other field crops"]', 0, 1, 30),
    (@type_id, 'blade_count', 'Number of blades', 'number', NULL, NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'paddy-harvester', 'Paddy Harvester', 0, 40);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'harvester_type', 'Harvester type', 'select', NULL, '["Combine harvester","Reaper"]', 1, 1, 10),
    (@type_id, 'cutting_width_m', 'Cutting width', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'engine_power_hp', 'Engine power', 'number', 'HP', NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'paddy-transplanter', 'Paddy Transplanter', 0, 50);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'rows', 'Rows planted', 'number', NULL, NULL, 1, 1, 10),
    (@type_id, 'transplanter_type', 'Type', 'select', NULL, '["Walk-behind","Ride-on"]', 0, 1, 20),
    (@type_id, 'engine_power_hp', 'Engine power', 'number', 'HP', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'sprayer-mist-blower', 'Sprayer / Mist Blower', 0, 60);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'tank_capacity_l', 'Tank capacity', 'number', 'L', NULL, 1, 1, 10),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Manual","Petrol","Battery","Tractor-mounted"]', 0, 1, 20),
    (@type_id, 'crop_type', 'Suitable for', 'multiselect', NULL, '["Paddy","Vegetable","Plantation","Other field crops"]', 0, 1, 30),
    (@type_id, 'spray_range_m', 'Spray range', 'number', 'm', NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'irrigation-pump', 'Irrigation Pump', 0, 70);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'flow_rate_lpm', 'Flow rate', 'number', 'L/min', NULL, 1, 1, 10),
    (@type_id, 'fuel_type', 'Fuel type', 'select', NULL, '["Diesel","Petrol","Electric","Solar"]', 0, 1, 20),
    (@type_id, 'outlet_size_in', 'Outlet size', 'number', 'in', NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'paddy-thresher', 'Paddy Thresher', 0, 80);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'output_kg_h', 'Output', 'number', 'kg/h', NULL, 1, 1, 10),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Diesel","Petrol","Electric","Tractor PTO"]', 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'brush-cutter', 'Brush Cutter', 0, 90);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'engine_cc', 'Engine size', 'number', 'cc', NULL, 1, 1, 10),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Petrol","Battery"]', 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'other-agriculture', 'Other Agriculture', 1, 999);

-- ----------------------------------------------------------------------
-- 8. Events & AV
INSERT INTO equipment_categories (slug, name, icon, sort_order) VALUES ('events-av', 'Events & AV', 'celebration', 80);
SET @category_id = LAST_INSERT_ID();

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'tent-marquee', 'Tent / Marquee', 0, 10);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'capacity_guests', 'Capacity', 'number', 'guests', NULL, 1, 1, 10),
    (@type_id, 'tent_type', 'Tent type', 'select', NULL, '["Marquee","Pagoda","Dome","Canopy"]', 0, 1, 20),
    (@type_id, 'size', 'Size (e.g. 10 m × 20 m)', 'text', NULL, NULL, 0, 0, 30),
    (@type_id, 'sides_included', 'Side walls included', 'boolean', NULL, NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'stage-platform', 'Stage Platform', 0, 20);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'stage_width_m', 'Width', 'number', 'm', NULL, 1, 1, 10),
    (@type_id, 'stage_depth_m', 'Depth', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'indoor_outdoor', 'Use', 'select', NULL, '["Indoor","Outdoor","Indoor & outdoor"]', 0, 1, 30),
    (@type_id, 'stage_height_m', 'Height', 'number', 'm', NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'sound-system', 'Sound System', 0, 30);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'power_output_w', 'Power output', 'number', 'W', NULL, 1, 1, 10),
    (@type_id, 'audience_size', 'Suitable audience', 'number', 'people', NULL, 0, 1, 20),
    (@type_id, 'indoor_outdoor', 'Use', 'select', NULL, '["Indoor","Outdoor","Indoor & outdoor"]', 0, 1, 30),
    (@type_id, 'microphones_included', 'Microphones included', 'number', NULL, NULL, 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'pa-speaker', 'PA Speaker', 0, 40);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'power_output_w', 'Power output', 'number', 'W', NULL, 1, 1, 10),
    (@type_id, 'powered', 'Powered (active)', 'boolean', NULL, NULL, 0, 1, 20),
    (@type_id, 'driver_size_in', 'Driver size', 'number', 'in', NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'stage-lighting-rig', 'Stage Lighting Rig', 0, 50);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'fixture_count', 'Number of fixtures', 'number', NULL, NULL, 1, 1, 10),
    (@type_id, 'power_required_w', 'Power required', 'number', 'W', NULL, 0, 1, 20),
    (@type_id, 'dmx_controller', 'DMX controller included', 'boolean', NULL, NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'led-screen', 'LED Screen', 0, 60);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'screen_width_m', 'Width', 'number', 'm', NULL, 1, 1, 10),
    (@type_id, 'screen_height_m', 'Height', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'pixel_pitch_mm', 'Pixel pitch', 'number', 'mm', NULL, 0, 1, 30),
    (@type_id, 'indoor_outdoor', 'Use', 'select', NULL, '["Indoor","Outdoor","Indoor & outdoor"]', 0, 0, 40);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'projector-screen', 'Projector & Screen', 0, 70);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'brightness_lumens', 'Brightness', 'number', 'lumens', NULL, 1, 1, 10),
    (@type_id, 'screen_size_in', 'Screen size', 'number', 'in', NULL, 0, 1, 20),
    (@type_id, 'resolution', 'Resolution', 'select', NULL, '["HD (720p)","Full HD (1080p)","4K"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'chairs', 'Chairs', 0, 80);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'chair_type', 'Chair type', 'select', NULL, '["Plastic","Banquet","Chiavari","Folding"]', 1, 1, 10),
    (@type_id, 'with_covers', 'Covers included', 'boolean', NULL, NULL, 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'tables', 'Tables', 0, 90);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'table_type', 'Table type', 'select', NULL, '["Round","Rectangular","Cocktail"]', 1, 1, 10),
    (@type_id, 'seats_per_table', 'Seats per table', 'number', NULL, NULL, 0, 1, 20),
    (@type_id, 'with_linen', 'Linen included', 'boolean', NULL, NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'mobile-toilet-event', 'Mobile Toilet (Event)', 0, 100);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'toilet_type', 'Toilet type', 'select', NULL, '["Standard","Luxury","Accessible"]', 1, 1, 10),
    (@type_id, 'has_handwash', 'Hand-wash station', 'boolean', NULL, NULL, 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'air-cooler-mist-fan', 'Air Cooler / Mist Fan', 0, 110);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'cooling_area_m2', 'Cooling area', 'number', 'm²', NULL, 1, 1, 10),
    (@type_id, 'cooler_type', 'Type', 'select', NULL, '["Evaporative cooler","Mist fan"]', 0, 1, 20),
    (@type_id, 'water_tank_l', 'Water tank', 'number', 'L', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'other-events-av', 'Other Events & AV', 1, 999);

-- ----------------------------------------------------------------------
-- 9. Site Facilities & Safety
INSERT INTO equipment_categories (slug, name, icon, sort_order) VALUES ('site-facilities-safety', 'Site Facilities & Safety', 'fence', 90);
SET @category_id = LAST_INSERT_ID();

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'site-cabin', 'Site Cabin / Office Container', 0, 10);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'size', 'Size', 'select', NULL, '["10 ft","20 ft","40 ft"]', 1, 1, 10),
    (@type_id, 'furnished', 'Furnished', 'boolean', NULL, NULL, 0, 1, 20),
    (@type_id, 'air_conditioned', 'Air conditioned', 'boolean', NULL, NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'storage-container', 'Storage Container', 0, 20);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'size', 'Size', 'select', NULL, '["10 ft","20 ft","40 ft"]', 1, 1, 10),
    (@type_id, 'container_type', 'Container type', 'select', NULL, '["Standard","High cube"]', 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'portable-toilet', 'Portable Toilet', 0, 30);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'toilet_type', 'Toilet type', 'select', NULL, '["Standard","Luxury","Accessible"]', 1, 1, 10),
    (@type_id, 'has_handwash', 'Hand-wash station', 'boolean', NULL, NULL, 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'barriers-fencing', 'Barriers / Fencing', 0, 40);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'barrier_type', 'Barrier type', 'select', NULL, '["Water-filled","Concrete","Steel mesh fence","Crowd control"]', 1, 1, 10),
    (@type_id, 'unit_length_m', 'Length per unit', 'number', 'm', NULL, 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'traffic-signs-cones', 'Traffic Signs & Cones', 0, 50);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'item_type', 'Item', 'select', NULL, '["Traffic cones","Road signs","Delineators","Flashing lights"]', 1, 1, 10),
    (@type_id, 'units_per_set', 'Units per set', 'number', NULL, NULL, 0, 0, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'site-water-tank', 'Site Water Tank', 0, 60);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'capacity_l', 'Capacity', 'number', 'L', NULL, 1, 1, 10),
    (@type_id, 'material', 'Material', 'select', NULL, '["Plastic","Steel"]', 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'safety-net', 'Safety Net', 0, 70);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'net_area_m2', 'Net area', 'number', 'm²', NULL, 1, 1, 10),
    (@type_id, 'net_type', 'Net type', 'select', NULL, '["Debris net","Fall-arrest net"]', 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'industrial-fan-portable-ac', 'Industrial Fan / Portable AC', 0, 80);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'cooling_area_m2', 'Cooling area', 'number', 'm²', NULL, 1, 1, 10),
    (@type_id, 'unit_type', 'Type', 'select', NULL, '["Industrial fan","Portable AC"]', 0, 1, 20),
    (@type_id, 'power_required_w', 'Power required', 'number', 'W', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'other-site-facilities-safety', 'Other Site Facilities & Safety', 1, 999);

-- ----------------------------------------------------------------------
-- 10. Cleaning & Warehouse
INSERT INTO equipment_categories (slug, name, icon, sort_order) VALUES ('cleaning-warehouse', 'Cleaning & Warehouse', 'cleaning_services', 100);
SET @category_id = LAST_INSERT_ID();

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'pressure-washer', 'Pressure Washer', 0, 10);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'max_pressure_bar', 'Max pressure', 'number', 'bar', NULL, 1, 1, 10),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Electric","Petrol","Diesel"]', 0, 1, 20),
    (@type_id, 'hot_water', 'Hot water', 'boolean', NULL, NULL, 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'floor-scrubber', 'Floor Scrubber', 0, 20);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'cleaning_width_mm', 'Cleaning width', 'number', 'mm', NULL, 1, 1, 10),
    (@type_id, 'scrubber_type', 'Type', 'select', NULL, '["Walk-behind","Ride-on"]', 0, 1, 20),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Battery","Corded electric"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'industrial-vacuum', 'Industrial Vacuum', 0, 30);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'tank_capacity_l', 'Tank capacity', 'number', 'L', NULL, 1, 1, 10),
    (@type_id, 'wet_dry', 'Wet & dry', 'boolean', NULL, NULL, 0, 1, 20),
    (@type_id, 'power_rating_w', 'Power rating', 'number', 'W', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'pallet-jack', 'Pallet Jack', 0, 40);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'load_capacity_kg', 'Load capacity', 'number', 'kg', NULL, 1, 1, 10),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Manual","Electric"]', 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'stacker', 'Stacker', 0, 50);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'load_capacity_kg', 'Load capacity', 'number', 'kg', NULL, 1, 1, 10),
    (@type_id, 'max_lift_height_m', 'Max lift height', 'number', 'm', NULL, 0, 1, 20),
    (@type_id, 'power_source', 'Power source', 'select', NULL, '["Manual","Semi-electric","Electric"]', 0, 1, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'racking-set', 'Racking Set', 0, 60);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'load_per_level_kg', 'Load per level', 'number', 'kg', NULL, 1, 1, 10),
    (@type_id, 'levels', 'Levels', 'number', NULL, NULL, 0, 1, 20),
    (@type_id, 'height_m', 'Height', 'number', 'm', NULL, 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'cold-room', 'Cold Room', 0, 70);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'volume_m3', 'Volume', 'number', 'm³', NULL, 1, 1, 10),
    (@type_id, 'min_temperature_c', 'Lowest temperature', 'number', '°C', NULL, 0, 1, 20),
    (@type_id, 'phase', 'Power supply', 'select', NULL, '["Single-phase","Three-phase"]', 0, 0, 30);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'dehumidifier', 'Dehumidifier', 0, 80);
SET @type_id = LAST_INSERT_ID();
INSERT INTO equipment_spec_fields (type_id, field_key, label, data_type, unit, options, is_required, is_filterable, sort_order) VALUES
    (@type_id, 'extraction_l_day', 'Extraction', 'number', 'L/day', NULL, 1, 1, 10),
    (@type_id, 'coverage_area_m2', 'Coverage area', 'number', 'm²', NULL, 0, 1, 20);

INSERT INTO equipment_types (category_id, slug, name, is_other, sort_order) VALUES (@category_id, 'other-cleaning-warehouse', 'Other Cleaning & Warehouse', 1, 999);
