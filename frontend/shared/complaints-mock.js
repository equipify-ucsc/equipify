/* ==========================================================================
   Equipify — Complaints data layer (UI only, mock data)
   Exposes window.EquipifyComplaints (complaints.js adds initPage to it).

   Complaints have no table or endpoints yet, so every role's Complaints page
   and the Admin "Complaints & Users" table read from this one file. Each
   method resolves with the same {ok, status, data, error, fields} shape
   EquipifyApi does, and lists use the {items, page, per_page, total,
   total_pages} envelope shared/list.js expects, so when the real API exists
   this file is the only thing that changes: each method becomes an
   EquipifyApi call.

   Everything lives in one localStorage store shared by every role, so a
   complaint submitted as a customer shows up in the admin's table in the same
   browser, and the admin's status change shows up on the customer's page. If
   storage is unavailable the seed is used and changes last until the page is
   left. With no real accounts behind it, "my complaints" means every
   complaint filed by the signed-in role.

   RULES is who each role may complain against (from the project brief), and
   CATEGORIES is the one list of complaint categories, each limited to the
   parties it makes sense for. The backend must enforce the same tables.
   ========================================================================== */

(function () {
  'use strict';

  var STORAGE_KEY = 'equipify.complaints.v1';
  var LIMITS = { against_name: 150, reference: 30, subject: 150, details: 2000 };

  var ROLE_LABELS = {
    customer: 'Customer',
    renting_party: 'Renting party',
    freelance_worker: 'Freelance worker',
    maintenance_tech: 'Technician',
    delivery_personnel: 'Delivery personnel'
  };

  // Who each role may file a complaint against.
  var RULES = {
    customer: ['renting_party', 'freelance_worker', 'delivery_personnel'],
    renting_party: ['customer', 'freelance_worker', 'delivery_personnel'],
    freelance_worker: ['customer'],
    maintenance_tech: ['renting_party'],
    delivery_personnel: ['customer']
  };

  var ALL = ['customer', 'renting_party', 'freelance_worker', 'delivery_personnel'];

  // appliesTo: the against-roles a category is offered for.
  var CATEGORIES = [
    { value: 'equipment_condition', label: 'Equipment condition / not as described', appliesTo: ['renting_party'] },
    { value: 'damage_loss', label: 'Damage or loss of equipment', appliesTo: ['customer', 'freelance_worker', 'delivery_personnel'] },
    { value: 'payment', label: 'Payment or refund issue', appliesTo: ALL },
    { value: 'late_no_show', label: 'Late, no-show or cancellation', appliesTo: ALL },
    { value: 'unsafe_conditions', label: 'Unsafe working conditions', appliesTo: ['customer', 'renting_party'] },
    { value: 'conduct', label: 'Conduct or harassment', appliesTo: ALL },
    { value: 'policy_fraud', label: 'Policy violation or fraud', appliesTo: ALL },
    { value: 'other', label: 'Other', appliesTo: ALL }
  ];

  // tone = a .badge-status modifier; the same set the freelancer portal used.
  var STATUSES = {
    submitted: { label: 'Submitted', tone: 'pending' },
    under_review: { label: 'Under review', tone: 'completed' },
    resolved: { label: 'Resolved', tone: 'active' },
    dismissed: { label: 'Dismissed', tone: 'draft' }
  };

  var PRIORITIES = {
    low: { label: 'Low', tone: 'completed' },
    medium: { label: 'Medium', tone: 'pending' },
    high: { label: 'High', tone: 'rejected' }
  };

  // ---------- seed ----------
  var H = 60 * 60 * 1000;
  var D = 24 * H;

  // [ref, complainant, complainant role, against role, against, reference,
  //  category, subject, details, priority, status, resolution, age]
  var SEED = [
    ['CP-97', 'Kasun Perera', 'customer', 'delivery_personnel', 'Saman Priyantha', 'DL-320', 'damage_loss',
      'Goods damaged in transit', 'Two scaffolding frames arrived bent and one base plate was missing on DL-320.', 'high', 'submitted', null, 6 * H],
    ['CP-96', 'Lanka Heavy Hire (Pvt) Ltd', 'renting_party', 'customer', 'Silva Road Works', 'RR-1016', 'damage_loss',
      'Excavator returned with a cracked bucket', 'The bucket teeth were cracked on return. The handover photos show it was intact.', 'high', 'submitted', null, 20 * H],
    ['CP-95', 'Sunil Rathnayake', 'freelance_worker', 'customer', 'Perera Constructions', 'JOB-3112', 'payment',
      'Unpaid overtime', 'The job ran three hours past the agreed finish and the extra time was not paid.', 'medium', 'under_review', null, 2 * D],
    ['CP-94', 'Nimali Fernando', 'customer', 'renting_party', 'Colombo Equip Rentals', 'RR-1011', 'late_no_show',
      'Late handover', 'The generator was ready four hours after the agreed pickup time, delaying the event setup.', 'medium', 'under_review', null, 3 * D],
    ['CP-93', 'Janaka Ekanayake', 'delivery_personnel', 'customer', 'Jayasinghe Builders', 'DL-305', 'conduct',
      'Abusive language at drop-off', 'The site supervisor shouted at me when the delivery was five minutes early.', 'medium', 'submitted', null, 4 * D],
    ['CP-92', 'Kandy Plant & Machinery', 'renting_party', 'delivery_personnel', 'Roshan Abeysekara', 'DL-298', 'late_no_show',
      'Pickup missed without notice', 'Nobody came to collect the roller for DL-298 and we were not told.', 'low', 'resolved', 'The delivery was rescheduled and the driver was reminded of the notice rules.', 5 * D],
    ['CP-91', 'Nuwan Herath', 'maintenance_tech', 'renting_party', 'Southern Crane Services', 'MT-118', 'payment',
      'Service invoice unpaid', 'The hydraulic repair on MT-118 was completed two weeks ago and is still unpaid.', 'medium', 'under_review', null, 6 * D],
    ['CP-90', 'Iresha Samarasinghe', 'delivery_personnel', 'customer', 'Green Acre Farms', 'DL-287', 'unsafe_conditions',
      'Unsafe loading bay', 'The unloading area had no firm ground and the truck nearly tipped.', 'high', 'resolved', 'The customer confirmed a prepared loading area for future deliveries.', 6 * D + 3 * H],
    ['CP-89', 'Tharindu Bandara', 'customer', 'freelance_worker', 'Anura Dissanayake', 'JOB-3104', 'late_no_show',
      'Operator did not show up', 'The forklift operator hired for JOB-3104 did not arrive and did not answer calls.', 'medium', 'dismissed', 'The operator had reported a road closure in time; no fault found.', 8 * D],
    ['CP-88', 'Kasun Perera', 'customer', 'renting_party', 'Negombo Tools Hub', 'RR-0995', 'equipment_condition',
      'Tent delivered damaged', 'The event tent had torn panels and two missing poles on arrival.', 'medium', 'resolved', 'A partial refund of LKR 6,500 was approved.', 12 * D],
    ['CP-87', 'Colombo Equip Rentals', 'renting_party', 'freelance_worker', 'Mahesh Gunawardena', 'RR-0990', 'conduct',
      'Operator misused the equipment', 'The backhoe was used outside the agreed site and for longer than booked.', 'high', 'under_review', null, 13 * D],
    ['CP-86', 'Pradeep Kumara', 'freelance_worker', 'customer', 'Fernando Events', 'JOB-3098', 'unsafe_conditions',
      'No safety barrier on site', 'The crane lift area was open to the public with no barrier or banksman.', 'high', 'resolved', 'The customer was warned and must confirm site safety before the next booking.', 15 * D],
    ['CP-85', 'Asanka Weerasinghe', 'maintenance_tech', 'renting_party', 'Lanka Heavy Hire (Pvt) Ltd', 'MT-109', 'conduct',
      'Site access refused', 'I was turned away at the gate for a booked engine service without explanation.', 'low', 'dismissed', 'The owner had cancelled the appointment through the platform in time.', 18 * D],
    ['CP-84', 'Dilani Wickramasinghe', 'customer', 'renting_party', 'Kandy Plant & Machinery', 'RR-0981', 'payment',
      'Deposit not returned', 'The security deposit for RR-0981 has not been returned three weeks after the rental ended.', 'medium', 'resolved', 'The deposit was refunded in full.', 21 * D],
    ['CP-83', 'Saman Priyantha', 'delivery_personnel', 'customer', 'Silva Road Works', 'DL-266', 'payment',
      'Late payment for waiting time', 'I waited two hours at the site and the waiting charge was disputed.', 'low', 'under_review', null, 24 * D],
    ['CP-82', 'Chamara Silva', 'customer', 'delivery_personnel', 'Janaka Ekanayake', 'DL-259', 'conduct',
      'Driver was rude', 'The driver refused to place the mixer where agreed and argued with our staff.', 'low', 'dismissed', 'Both sides agreed the placement was unsafe; no further action.', 27 * D]
  ];

  function iso(ms) {
    return new Date(ms).toISOString();
  }

  function buildSeed() {
    var now = Date.now();
    return {
      next_number: 98,
      complaints: SEED.map(function (row) {
        var submitted = now - row[12];
        var decided = row[10] !== 'submitted';
        return {
          reference: row[0],
          complainant_name: row[1],
          complainant_role: row[2],
          against_role: row[3],
          against_name: row[4],
          related_ref: row[5],
          category: row[6],
          subject: row[7],
          details: row[8],
          priority: row[9],
          status: row[10],
          resolution: row[11],
          submitted_at: iso(submitted),
          updated_at: iso(decided ? Math.min(now, submitted + 2 * D) : submitted)
        };
      })
    };
  }

  // ---------- storage ----------
  var state = null;

  function load() {
    if (state) return state;
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.complaints)) state = parsed;
      }
    } catch (e) { /* storage blocked: fall back to the seed */ }
    if (!state) {
      state = buildSeed();
      save();
    }
    return state;
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* changes last until the page is left */ }
  }

  // ---------- helpers ----------
  function ok(data) {
    return Promise.resolve({ ok: true, status: 200, data: data, error: '', fields: {} });
  }

  function fail(status, error, fields) {
    return Promise.resolve({ ok: false, status: status, data: null, error: error, fields: fields || {} });
  }

  function copy(row) {
    var out = {};
    Object.keys(row).forEach(function (key) { out[key] = row[key]; });
    return out;
  }

  function categoryLabel(value) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].value === value) return CATEGORIES[i].label;
    }
    return 'Other';
  }

  /** The categories offered when complaining against this role. */
  function categoriesFor(againstRole) {
    return CATEGORIES.filter(function (c) { return c.appliesTo.indexOf(againstRole) !== -1; });
  }

  function matchesSearch(row, q) {
    if (!q) return true;
    var haystack = [row.reference, row.subject, row.details, row.against_name, row.complainant_name,
      row.related_ref || '', categoryLabel(row.category)].join(' ').toLowerCase();
    return haystack.indexOf(q.toLowerCase()) !== -1;
  }

  // Status and priority sort in their natural order, not alphabetically.
  var ORDER = {
    status: ['submitted', 'under_review', 'resolved', 'dismissed'],
    role: ['customer', 'renting_party', 'freelance_worker', 'maintenance_tech', 'delivery_personnel']
  };

  function sortRows(rows, sort, dir) {
    var field = sort === 'role' ? 'complainant_role' : sort === 'status' ? 'status' : '';
    rows.sort(function (a, b) {
      if (field) {
        var diff = ORDER[sort].indexOf(a[field]) - ORDER[sort].indexOf(b[field]);
        if (diff !== 0) return dir === 'desc' ? -diff : diff;
      }
      return a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0;
    });
    return rows;
  }

  function page(rows, params) {
    var perPage = Math.max(1, Math.min(50, parseInt(params.per_page, 10) || 10));
    var total = rows.length;
    var totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
    var current = Math.max(1, parseInt(params.page, 10) || 1);
    var start = (current - 1) * perPage;
    return {
      items: rows.slice(start, start + perPage).map(copy),
      page: current,
      per_page: perPage,
      total: total,
      total_pages: totalPages
    };
  }

  // ---------- API ----------

  /** The signed-in role's complaints ?q=&status=&category=&page=&per_page=. */
  function mine(role, params) {
    params = params || {};
    var rows = load().complaints.filter(function (row) {
      return row.complainant_role === role
        && (!params.status || row.status === params.status)
        && (!params.category || row.category === params.category)
        && matchesSearch(row, params.q);
    });
    return ok(page(sortRows(rows, '', ''), params));
  }

  /** Every complaint, for the admin ?q=&role=&status=&category=&sort=&dir=&page=&per_page=. */
  function adminList(params) {
    params = params || {};
    var rows = load().complaints.filter(function (row) {
      return (!params.role || row.complainant_role === params.role)
        && (!params.status || row.status === params.status)
        && (!params.category || row.category === params.category)
        && matchesSearch(row, params.q);
    });
    return ok(page(sortRows(rows, params.sort, params.dir), params));
  }

  /**
   * Files a complaint for role. Only a well-formed check (required fields,
   * lengths, and the against/category choices allowed for this role).
   */
  function submit(role, body, complainantName) {
    var fields = {};
    var clean = {};
    ['against_role', 'against_name', 'category', 'reference', 'subject', 'details'].forEach(function (key) {
      clean[key] = typeof body[key] === 'string' ? body[key].trim() : '';
    });

    var allowed = RULES[role] || [];
    if (allowed.indexOf(clean.against_role) === -1) fields.against_role = 'Choose who the complaint is against.';
    if (!clean.against_name) fields.against_name = 'Enter the name of the person or business.';
    if (!categoriesFor(clean.against_role).some(function (c) { return c.value === clean.category; })) {
      fields.category = 'Choose a category.';
    }
    if (!clean.subject) fields.subject = 'Enter a subject.';
    if (!clean.details) fields.details = 'Describe what happened.';
    Object.keys(LIMITS).forEach(function (key) {
      if (clean[key].length > LIMITS[key] && !fields[key]) {
        fields[key] = 'Keep this to ' + LIMITS[key] + ' characters or fewer.';
      }
    });
    if (Object.keys(fields).length) return fail(422, 'Please fix the highlighted fields.', fields);

    var data = load();
    var now = iso(Date.now());
    var row = {
      reference: 'CP-' + data.next_number++,
      complainant_name: complainantName || ROLE_LABELS[role] || 'User',
      complainant_role: role,
      against_role: clean.against_role,
      against_name: clean.against_name,
      related_ref: clean.reference || null,
      category: clean.category,
      subject: clean.subject,
      details: clean.details,
      priority: 'medium',
      status: 'submitted',
      resolution: null,
      submitted_at: now,
      updated_at: now
    };
    data.complaints.unshift(row);
    save();
    return ok(copy(row));
  }

  /** Admin: change a complaint's status and/or priority, with an optional note. */
  function update(reference, changes) {
    var data = load();
    var row = null;
    for (var i = 0; i < data.complaints.length; i++) {
      if (data.complaints[i].reference === reference) { row = data.complaints[i]; break; }
    }
    if (!row) return fail(404, 'Complaint not found.');
    if (changes.status) {
      if (!STATUSES[changes.status]) return fail(422, 'Choose a valid status.');
      row.status = changes.status;
    }
    if (changes.priority) {
      if (!PRIORITIES[changes.priority]) return fail(422, 'Choose a valid priority.');
      row.priority = changes.priority;
    }
    if (typeof changes.resolution === 'string' && changes.resolution.trim()) {
      row.resolution = changes.resolution.trim().slice(0, 500);
    }
    row.updated_at = iso(Date.now());
    save();
    return ok(copy(row));
  }

  window.EquipifyComplaints = {
    ROLE_LABELS: ROLE_LABELS,
    RULES: RULES,
    CATEGORIES: CATEGORIES,
    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    categoriesFor: categoriesFor,
    categoryLabel: categoryLabel,
    mine: mine,
    adminList: adminList,
    submit: submit,
    update: update
  };
})();
