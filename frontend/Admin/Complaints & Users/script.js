/* ==========================================================================
   Equipify — Complaints & Users
   Two paged lists, each with search, Role and Status filters and sortable
   Role / Status headers:

     Complaints       every complaint filed on the platform. UI only for now:
                      read from shared/complaints-mock.js (the same store the
                      role's Complaints pages write to). Review opens a modal
                      to set the priority and mark it under review, resolved
                      or dismissed.
     Platform users   every non-admin account, live from GET /admin/users;
                      Change status goes through shared/account-status.js
                      (POST /admin/users/{id}/status).

   Needs shared/api.js, shared/list.js, shared/complaints-mock.js and
   shared/account-status.js. Rows are built with createElement/textContent.
   ========================================================================== */

(function () {
  'use strict';

  var C = window.EquipifyComplaints;

  var ROLE_LABELS = {
    customer: 'Customer',
    renting_party: 'Renting party',
    freelance_worker: 'Freelance worker',
    maintenance_tech: 'Technician',
    delivery_personnel: 'Delivery personnel',
    area_manager: 'Area manager'
  };

  // ---------- Toast helper ----------
  var toastTimer;
  window.showToast = function (message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2600);
  };

  // ---------- Modal close ----------
  function closeModal(modal) {
    if (modal) modal.classList.remove('is-open');
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
    document.querySelectorAll('.modal-backdrop.is-open').forEach(closeModal);
  });

  // ---------- Small DOM helpers ----------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function td(text, className) {
    return el('td', className, text);
  }

  /** A cell with a bold first line and a muted second line. */
  function twoLineCell(main, sub) {
    var cell = el('td');
    cell.appendChild(el('strong', null, main));
    if (sub) cell.appendChild(el('span', 'cell-muted', sub));
    return cell;
  }

  function badge(tone, label) {
    return el('span', 'badge-status badge-status--' + tone, label);
  }

  function formatDate(value) {
    if (!value) return '';
    var parsed = new Date(String(value).replace(' ', 'T'));
    if (isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function option(value, label) {
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    return opt;
  }

  /**
   * Makes a table's [data-sort] header buttons drive a list's sort/dir params.
   * Clicking a column sorts it ascending, clicking it again flips the order.
   */
  function wireSortHeaders(table, getList) {
    var state = { sort: '', dir: 'asc' };
    table.querySelectorAll('[data-sort]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.sort;
        state.dir = state.sort === key && state.dir === 'asc' ? 'desc' : 'asc';
        state.sort = key;

        table.querySelectorAll('[data-sort]').forEach(function (other) {
          var th = other.closest('th');
          var iconEl = other.querySelector('.icon');
          var active = other === btn;
          th.setAttribute('aria-sort', active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
          iconEl.textContent = active ? (state.dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';
        });

        var list = getList();
        if (!list) return;
        list.setParam('sort', state.sort, true);
        list.setParam('dir', state.dir);
      });
    });
  }

  // ======================================================================
  // Complaints (UI only: shared/complaints-mock.js)
  // ======================================================================
  var complaintsTable = document.getElementById('complaintsTable');
  var complaintStatusFilter = document.getElementById('complaintStatusFilter');
  var complaintCategoryFilter = document.getElementById('complaintCategoryFilter');

  Object.keys(C.STATUSES).forEach(function (key) {
    complaintStatusFilter.appendChild(option(key, C.STATUSES[key].label));
  });
  C.CATEGORIES.forEach(function (c) {
    complaintCategoryFilter.appendChild(option(c.value, c.label));
  });

  var complaintList = EquipifyList.create({
    source: C.adminList,
    container: complaintsTable.querySelector('tbody'),
    searchInput: document.getElementById('complaintSearch'),
    filters: {
      role: document.getElementById('complaintRoleFilter'),
      category: complaintCategoryFilter,
      status: complaintStatusFilter
    },
    pager: document.getElementById('complaintPager'),
    countLabel: document.getElementById('complaintCount'),
    perPage: 10,
    columns: 10,
    emptyMessage: 'No complaints match these filters.',
    renderItem: complaintRow
  });
  wireSortHeaders(complaintsTable, function () { return complaintList; });

  function complaintRow(c) {
    var tr = document.createElement('tr');
    tr.appendChild(td(c.reference));
    tr.appendChild(twoLineCell(c.complainant_name));
    tr.appendChild(td(C.ROLE_LABELS[c.complainant_role] || c.complainant_role));
    tr.appendChild(twoLineCell(c.against_name,
      (C.ROLE_LABELS[c.against_role] || c.against_role) + (c.related_ref ? ' · ' + c.related_ref : '')));
    tr.appendChild(td(C.categoryLabel(c.category)));
    tr.appendChild(td(c.subject));

    var priority = el('td');
    var p = C.PRIORITIES[c.priority] || C.PRIORITIES.medium;
    priority.appendChild(badge(p.tone, p.label));
    tr.appendChild(priority);

    var status = el('td');
    var s = C.STATUSES[c.status] || { tone: 'draft', label: c.status };
    status.appendChild(badge(s.tone, s.label));
    tr.appendChild(status);

    tr.appendChild(td(formatDate(c.submitted_at)));

    var action = el('td');
    var open = c.status === 'submitted' || c.status === 'under_review';
    var btn = el('button', 'btn-outline btn-sm', open ? 'Review' : 'View');
    btn.type = 'button';
    btn.addEventListener('click', function () { openComplaint(c); });
    action.appendChild(btn);
    tr.appendChild(action);
    return tr;
  }

  // ---------- Complaint review modal ----------
  var complaintModal = document.getElementById('complaintModal');
  var modalError = document.getElementById('complaintModalError');
  var priorityInput = document.getElementById('complaintPriority');
  var noteInput = document.getElementById('complaintNote');
  var current = null;

  function setText(id, text) {
    document.getElementById(id).textContent = text;
  }

  function openComplaint(c) {
    current = c;
    modalError.hidden = true;
    setText('complaintModalMeta', c.reference + ' · ' + c.complainant_name + ' (' +
      (C.ROLE_LABELS[c.complainant_role] || c.complainant_role) + ') · ' + formatDate(c.submitted_at));
    setText('complaintModalSubject', c.subject + ' — ' + C.categoryLabel(c.category));
    setText('complaintModalDetails', c.details);
    setText('complaintModalAgainst', 'Against: ' + c.against_name + ' (' +
      (C.ROLE_LABELS[c.against_role] || c.against_role) + ')' + (c.related_ref ? ' · ' + c.related_ref : ''));

    var resolution = document.getElementById('complaintModalResolution');
    resolution.hidden = !c.resolution;
    resolution.textContent = c.resolution ? 'Resolution: ' + c.resolution : '';

    priorityInput.value = c.priority;
    document.getElementById('complaintStatusNow').value = (C.STATUSES[c.status] || {}).label || c.status;
    noteInput.value = '';

    // A closed complaint can still be re-prioritised or re-opened for review,
    // but not closed a second time.
    var closed = c.status === 'resolved' || c.status === 'dismissed';
    complaintModal.querySelectorAll('[data-complaint-action]').forEach(function (btn) {
      var action = btn.dataset.complaintAction;
      btn.hidden = (closed && (action === 'resolved' || action === 'dismissed'))
        || (action === 'under_review' && c.status === 'under_review');
    });

    complaintModal.classList.add('is-open');
  }

  var ACTION_MESSAGES = {
    save: 'Priority saved.',
    under_review: 'Complaint marked under review.',
    resolved: 'Complaint resolved.',
    dismissed: 'Complaint dismissed.'
  };

  complaintModal.querySelectorAll('[data-complaint-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!current) return;
      var action = btn.dataset.complaintAction;
      var note = noteInput.value.trim();
      if ((action === 'resolved' || action === 'dismissed') && !note) {
        modalError.textContent = 'Add a resolution note so the complainant knows the outcome.';
        modalError.hidden = false;
        noteInput.focus();
        return;
      }

      C.update(current.reference, {
        status: action === 'save' ? '' : action,
        priority: priorityInput.value,
        resolution: note
      }).then(function (res) {
        if (!res.ok) {
          modalError.textContent = res.error;
          modalError.hidden = false;
          return;
        }
        closeModal(complaintModal);
        window.showToast(ACTION_MESSAGES[action]);
        complaintList.reload();
      });
    });
  });

  // ======================================================================
  // Platform users (real: GET /admin/users)
  // ======================================================================
  var usersTable = document.getElementById('usersTable');

  var userList = EquipifyList.create({
    endpoint: '/admin/users',
    container: usersTable.querySelector('tbody'),
    searchInput: document.getElementById('userSearch'),
    filters: {
      role: document.getElementById('userRoleFilter'),
      status: document.getElementById('userStatusFilter')
    },
    pager: document.getElementById('userPager'),
    countLabel: document.getElementById('userCount'),
    perPage: 10,
    columns: 6,
    emptyMessage: 'No users match these filters.',
    renderItem: userRow
  });
  wireSortHeaders(usersTable, function () { return userList; });

  function userRow(u) {
    var tr = document.createElement('tr');
    // A renting party is known by its business; the person is the contact.
    tr.appendChild(u.business_name
      ? twoLineCell(u.business_name, u.full_name)
      : twoLineCell(u.full_name));
    tr.appendChild(td(u.email));
    tr.appendChild(td(ROLE_LABELS[u.role] || u.role));

    var status = el('td');
    status.appendChild(EquipifyAccountStatus.badge(u.account_status));
    if (u.status_reason) status.appendChild(el('span', 'cell-muted', u.status_reason));
    tr.appendChild(status);

    tr.appendChild(td(formatDate(u.created_at)));

    var action = el('td');
    var btn = el('button', 'btn-outline btn-sm', 'Change status');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      EquipifyAccountStatus.open(u, function () { userList.reload(); });
    });
    action.appendChild(btn);
    tr.appendChild(action);
    return tr;
  }
})();
