/* ==========================================================================
   Equipify — Renting Party Rental Requests
   Incoming rental requests with their response / payment deadlines, the
   status filter, and the details / accept / reject dialogs. Vanilla JS, no
   dependencies. Mobile navigation drawer behavior lives in
   ../../shared/script.js; deadline rules in ../../shared/rental-timing.js.

   UI only for now: REQUESTS is mock data and accepting or rejecting only
   changes the page. The rentals module will load the list and
   PATCH /rentals/{id}/accept | /reject; the server decides the deadlines.
   ========================================================================== */

(function () {
  'use strict';

  var Timing = window.EquipifyRentalTiming;
  var MINUTE_MS = 60 * 1000;
  var now = Date.now();

  function minutesAgo(minutes) {
    return new Date(now - minutes * MINUTE_MS);
  }

  /* ---------------- Mock requests ----------------
     status: response | payment | confirmed | rejected | expired
     deadline: end of the day after the request (response) or after
     acceptance (payment), via Timing.deadlineFrom. */

  var REQUESTS = [
    {
      ref: 'RQ-2045', company: 'Summit Build Co.', contact: 'Sarah Jenkins',
      equipment: 'Excavator CAT 320', equipmentId: 'EQ-4092',
      start: '2026-10-04', end: '2026-10-11', units: 1, dailyRate: 28000, deposit: 50000,
      logistics: 'delivery', place: 'Kaduwela, Colombo',
      siteContact: 'Sarah Jenkins · 077 123 4567',
      notes: 'Foundation excavation for a 3-storey building. Site access is through the north gate.',
      status: 'response', deadline: Timing.deadlineFrom(minutesAgo(300), Timing.RESPONSE_DAYS)
    },
    {
      ref: 'RQ-2044', company: 'Metro Roads (Pvt) Ltd', contact: 'Mahesh Rodrigo',
      equipment: 'Asphalt Paver Volvo P6820', equipmentId: 'EQ-1120',
      start: '2026-10-02', end: '2026-10-05', units: 1, dailyRate: 95000, deposit: 100000,
      logistics: 'self', place: 'Collected from your yard',
      siteContact: 'Ruwan Fernando · 071 555 0192',
      notes: 'Resurfacing a 400 m access road. Our own low-bed truck will collect it.',
      status: 'response', deadline: Timing.deadlineFrom(minutesAgo(1320), Timing.RESPONSE_DAYS)
    },
    {
      ref: 'RQ-2041', company: 'Kandy Builders', contact: 'Nimal Perera',
      equipment: 'Bobcat S650 Skid-Steer', equipmentId: 'EQ-2210',
      start: '2026-10-03', end: '2026-10-10', units: 1, dailyRate: 12000, deposit: 25000,
      logistics: 'delivery', place: 'Maharagama, Colombo',
      siteContact: 'Nimal Perera · 076 845 2210',
      notes: '',
      status: 'payment', deadline: Timing.deadlineFrom(minutesAgo(120), Timing.PAYMENT_DAYS)
    },
    {
      ref: 'RQ-2036', company: 'Apex Builders', contact: 'Janaka Bandara',
      equipment: 'Scissor Lift 19ft', equipmentId: 'EQ-3301',
      start: '2026-09-28', end: '2026-10-02', units: 2, dailyRate: 7500, deposit: 20000,
      logistics: 'delivery', place: 'Nugegoda, Colombo',
      siteContact: 'Janaka Bandara · 077 902 3345',
      notes: 'Interior ceiling work, indoor use only.',
      status: 'confirmed'
    },
    {
      ref: 'RQ-2030', company: 'TerraCorp', contact: 'Tharindu Silva',
      equipment: 'Backhoe Loader JCB 3CX', equipmentId: 'EQ-1877',
      start: '2026-10-06', end: '2026-10-09', units: 1, dailyRate: 32000, deposit: 40000,
      logistics: 'delivery', place: 'Negombo, Gampaha',
      siteContact: 'Tharindu Silva · 070 118 4471',
      notes: '',
      status: 'rejected', outcome: 'Under maintenance'
    },
    {
      ref: 'RQ-2027', company: 'Coastal Constructions', contact: 'Farah Ismail',
      equipment: 'Concrete Mixer 350L', equipmentId: 'EQ-0954',
      start: '2026-09-30', end: '2026-10-03', units: 1, dailyRate: 4500, deposit: 5000,
      logistics: 'self', place: 'Collected from your yard',
      siteContact: 'Farah Ismail · 075 330 6612',
      notes: '',
      status: 'expired', outcome: 'No response by the deadline'
    },
    {
      ref: 'RQ-2025', company: 'BuildRight Lanka', contact: 'Kasun Jayawardena',
      equipment: 'Diesel Generator 100kVA', equipmentId: 'EQ-2002',
      start: '2026-10-01', end: '2026-10-04', units: 1, dailyRate: 18000, deposit: 30000,
      logistics: 'delivery', place: 'Panadura, Kalutara',
      siteContact: 'Kasun Jayawardena · 072 440 9018',
      notes: 'Backup power for a wedding venue.',
      status: 'expired', outcome: 'Customer did not pay in time'
    }
  ];

  var STATUS = {
    response: { label: 'Awaiting Response', badge: 'pending' },
    payment: { label: 'Awaiting Payment', badge: 'completed' },
    confirmed: { label: 'Confirmed', badge: 'active' },
    rejected: { label: 'Rejected', badge: 'rejected' },
    expired: { label: 'Expired', badge: 'draft' }
  };

  /* ---------------- Helpers ---------------- */

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(name) {
    var span = el('span', 'icon', name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function formatLKR(amount) {
    return 'LKR ' + Number(amount).toLocaleString('en-LK', { maximumFractionDigits: 2 });
  }

  var shortDate = Timing.formatShortDate;

  function initials(name) {
    return name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean)
      .map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
  }

  function days(req) { return Timing.daysBetween(req.start, req.end); }
  function total(req) { return req.dailyRate * days(req) * req.units; }

  function find(ref) {
    for (var i = 0; i < REQUESTS.length; i++) {
      if (REQUESTS[i].ref === ref) return REQUESTS[i];
    }
    return null;
  }

  function handoverText(req) {
    return (req.logistics === 'delivery' ? 'Platform delivery' : 'Customer pickup') + ' ' + shortDate(Timing.dayBefore(req.start));
  }

  /* ---------------- Table ---------------- */

  var tbody = $('requestsBody');
  var statusFilter = $('statusFilter');

  function badge(req) {
    var meta = STATUS[req.status];
    return el('span', 'badge-status badge-status--' + meta.badge, meta.label);
  }

  // The line under the status badge: a live deadline or the outcome.
  function statusSub(req) {
    if (req.status === 'response' || req.status === 'payment') {
      var line = el('span', 'status-sub deadline-inline');
      line.setAttribute('data-deadline', req.deadline.toISOString());
      line.setAttribute('data-ref', req.ref);
      line.appendChild(icon(req.status === 'response' ? 'hourglass_top' : 'schedule'));
      var text = el('span');
      text.appendChild(document.createTextNode(req.status === 'response' ? 'Respond within ' : 'Customer pays within '));
      var remaining = el('strong');
      remaining.setAttribute('data-countdown-remaining', '');
      text.appendChild(remaining);
      line.appendChild(text);
      line.title = 'Deadline: ' + Timing.formatDateTime(req.deadline);
      return line;
    }
    if (req.status === 'confirmed') {
      return el('span', 'status-sub', 'Paid · ' + handoverText(req));
    }
    return el('span', 'status-sub', req.outcome || '');
  }

  function actionButton(action, iconName, label, extraClass) {
    var btn = el('button', 'action-btn' + (extraClass ? ' ' + extraClass : ''));
    btn.type = 'button';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('data-action', action);
    btn.appendChild(icon(iconName));
    return btn;
  }

  function row(req) {
    var tr = el('tr');
    tr.setAttribute('data-ref', req.ref);
    tr.setAttribute('data-status', req.status);
    if (req.status === 'response') tr.className = 'needs-response';

    var customer = el('td');
    var cell = el('div', 'customer-cell');
    cell.appendChild(el('div', 'avatar-circle', initials(req.company)));
    var info = el('div', 'customer-info');
    info.appendChild(el('span', 'company-name', req.company));
    info.appendChild(el('span', 'contact-name', req.contact));
    cell.appendChild(info);
    customer.appendChild(cell);

    var equipment = el('td');
    var eq = el('div', 'equipment-info');
    eq.appendChild(el('span', 'equipment-title', req.equipment));
    eq.appendChild(el('span', 'equipment-id', 'ID: ' + req.equipmentId + (req.units > 1 ? ' · ' + req.units + ' units' : '')));
    equipment.appendChild(eq);

    var period = el('td');
    var p = el('div', 'period-info');
    p.appendChild(el('span', 'date-range', shortDate(req.start) + ' - ' + shortDate(req.end)));
    p.appendChild(el('span', 'days-count', days(req) + (days(req) === 1 ? ' Day' : ' Days')));
    period.appendChild(p);

    var amount = el('td', 'amount-cell', formatLKR(total(req)));

    var status = el('td');
    var statusWrap = el('div', 'status-cell');
    statusWrap.appendChild(badge(req));
    statusWrap.appendChild(statusSub(req));
    status.appendChild(statusWrap);

    var actions = el('td', 'actions-cell');
    var wrap = el('div', 'row-actions');
    wrap.appendChild(actionButton('view', 'visibility', 'View request ' + req.ref));
    if (req.status === 'response') {
      wrap.appendChild(actionButton('accept', 'check', 'Accept request ' + req.ref, 'approve'));
      wrap.appendChild(actionButton('reject', 'close', 'Reject request ' + req.ref, 'decline'));
    }
    actions.appendChild(wrap);

    [customer, equipment, period, amount, status, actions].forEach(function (td) { tr.appendChild(td); });
    return tr;
  }

  function render() {
    var filter = statusFilter.value;
    var shown = 0;
    tbody.textContent = '';
    REQUESTS.forEach(function (req) {
      if (filter !== 'all' && req.status !== filter) return;
      tbody.appendChild(row(req));
      shown += 1;
    });

    $('tableEmpty').hidden = shown !== 0;
    $('paginationInfo').textContent = shown
      ? 'Showing 1 to ' + shown + ' of ' + shown + (shown === 1 ? ' entry' : ' entries')
      : 'No entries';

    var waiting = REQUESTS.filter(function (req) { return req.status === 'response'; }).length;
    $('attentionChip').hidden = waiting === 0;
    $('attentionText').textContent = waiting + (waiting === 1 ? ' request needs' : ' requests need') + ' your response';

    refreshCountdowns();
  }

  statusFilter.addEventListener('change', render);
  $('attentionChip').addEventListener('click', function () {
    statusFilter.value = 'response';
    render();
  });

  /* ---------------- Deadlines ---------------- */

  function expire(req) {
    if (req.status === 'response') {
      req.status = 'expired';
      req.outcome = 'No response by the deadline';
    } else if (req.status === 'payment') {
      req.status = 'expired';
      req.outcome = 'Customer did not pay in time';
    }
  }

  var renderQueued = false;

  var refreshCountdowns = Timing.startCountdowns(tbody, function (line) {
    var req = find(line.getAttribute('data-ref'));
    if (!req) return;
    expire(req);
    // Re-render once, after this tick finishes walking the rows.
    if (renderQueued) return;
    renderQueued = true;
    window.setTimeout(function () {
      renderQueued = false;
      render();
    }, 0);
  });

  /* ---------------- Dialogs ---------------- */

  var lastTrigger = null;
  var current = null;

  function openModal(modal, trigger) {
    if (trigger) lastTrigger = trigger;
    modal.classList.add('is-open');
    var focusTarget = modal.querySelector('select, .modal-actions .btn-primary, .modal-actions .btn-danger, .modal-close');
    if (focusTarget) focusTarget.focus();
  }

  function closeModal(modal) {
    modal.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open') && lastTrigger && document.body.contains(lastTrigger)) {
      lastTrigger.focus();
    }
  }

  function closeAll() {
    document.querySelectorAll('.modal-backdrop.is-open').forEach(function (m) { m.classList.remove('is-open'); });
  }

  document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeModal(btn.closest('.modal-backdrop')); });
  });
  document.querySelectorAll('.modal-backdrop').forEach(function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal(modal);
    });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var open = document.querySelectorAll('.modal-backdrop.is-open');
    if (open.length) closeModal(open[open.length - 1]);
  });

  function subtitle(req) {
    return req.ref + ' · ' + req.company + ' · ' + req.equipment;
  }

  // Details
  function showDetails(req, trigger) {
    current = req;
    $('detailsSubtitle').textContent = subtitle(req);

    var statusBox = $('detailsStatus');
    statusBox.textContent = '';
    statusBox.className = 'details-status details-status--' + req.status;
    statusBox.appendChild(badge(req));
    var statusText;
    if (req.status === 'response') statusText = 'Respond by ' + Timing.formatDateTime(req.deadline) + ', or the request expires.';
    else if (req.status === 'payment') statusText = 'The customer must pay by ' + Timing.formatDateTime(req.deadline) + '.';
    else if (req.status === 'confirmed') statusText = 'Paid. ' + handoverText(req) + '.';
    else statusText = req.outcome + (req.message ? ' — "' + req.message + '"' : '');
    statusBox.appendChild(el('span', null, statusText));

    $('dCompany').textContent = req.company;
    $('dContact').textContent = req.contact;
    $('dSiteContact').textContent = req.siteContact;
    $('dEquipment').textContent = req.equipment + ' (' + req.equipmentId + ')';
    $('dDates').textContent = Timing.formatDate(req.start) + ' – ' + Timing.formatDate(req.end) + ' (' + days(req) + ' days)';
    $('dUnits').textContent = String(req.units);
    $('dHandover').textContent = req.logistics === 'delivery' ? 'Equipify platform delivery' : 'Customer pickup';
    $('dPlaceLabel').textContent = req.logistics === 'delivery' ? 'Delivery area' : 'Pickup';
    $('dPlace').textContent = req.place;
    $('dHandoverDate').textContent = Timing.formatDate(Timing.dayBefore(req.start));
    $('dTotal').textContent = formatLKR(total(req)) + ' (' + formatLKR(req.dailyRate) + ' x ' + days(req) + ' days' +
      (req.units > 1 ? ' x ' + req.units + ' units' : '') + ')';
    $('dDeposit').textContent = formatLKR(req.deposit);
    $('dNotes').textContent = req.notes || 'No notes.';
    $('dNotes').classList.toggle('is-empty', !req.notes);

    var canRespond = req.status === 'response';
    $('detailsAcceptBtn').hidden = !canRespond;
    $('detailsRejectBtn').hidden = !canRespond;

    openModal($('detailsModal'), trigger);
  }

  // Accept
  function showAccept(req, trigger) {
    current = req;
    $('acceptSubtitle').textContent = subtitle(req);
    $('acceptPayBy').textContent = Timing.formatDateTime(Timing.deadlineFrom(new Date(), Timing.PAYMENT_DAYS));
    openModal($('acceptModal'), trigger);
  }

  $('acceptConfirmBtn').addEventListener('click', function () {
    if (current && current.status === 'response') {
      current.status = 'payment';
      current.deadline = Timing.deadlineFrom(new Date(), Timing.PAYMENT_DAYS);
    }
    closeAll();
    render();
  });

  // Reject
  var rejectReason = $('rejectReason');

  function showReject(req, trigger) {
    current = req;
    $('rejectSubtitle').textContent = subtitle(req);
    $('rejectForm').reset();
    $('rejectReasonError').classList.remove('is-visible');
    rejectReason.classList.remove('input-error');
    openModal($('rejectModal'), trigger);
  }

  rejectReason.addEventListener('change', function () {
    if (rejectReason.value) {
      $('rejectReasonError').classList.remove('is-visible');
      rejectReason.classList.remove('input-error');
    }
  });

  $('rejectForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!rejectReason.value) {
      $('rejectReasonError').classList.add('is-visible');
      rejectReason.classList.add('input-error');
      rejectReason.focus();
      return;
    }
    if (current && current.status === 'response') {
      current.status = 'rejected';
      current.outcome = rejectReason.value;
      current.message = $('rejectMessage').value.trim();
    }
    closeAll();
    render();
  });

  $('detailsAcceptBtn').addEventListener('click', function () { showAccept(current); });
  $('detailsRejectBtn').addEventListener('click', function () { showReject(current); });

  tbody.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-action]');
    if (!btn) return;
    var req = find(btn.closest('tr').getAttribute('data-ref'));
    if (!req) return;
    var action = btn.getAttribute('data-action');
    if (action === 'view') showDetails(req, btn);
    else if (action === 'accept') showAccept(req, btn);
    else if (action === 'reject') showReject(req, btn);
  });

  render();
})();
