/* ==========================================================================
   Equipify — Maintenance Technicians (Area Manager)
   Mobile navigation drawer, roster table search/filter, and the
   register-technician modal wired to the API (vanilla JS, no dependencies).

   The roster is whatever GET /area-manager/technicians returns for the
   signed-in area manager; registering posts to the same path.
   ========================================================================== */

(function () {
  'use strict';

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

  // ---------- Stub links (sections not built yet) ----------
  document.querySelectorAll('.is-stub').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var label = link.getAttribute('data-stub-label') || 'This section';
      window.showToast(label + ' is coming soon.');
    });
  });

  // ---------- Table search + status filter ----------
  var table = document.getElementById('technicianTable');
  var tableBody = table ? table.querySelector('tbody') : null;
  var searchInput = document.querySelector('[data-filter-table="technicianTable"]');
  var statusFilter = document.getElementById('statusFilter');

  function applyFilters() {
    if (!table) return;
    var query = (searchInput ? searchInput.value : '').toLowerCase();
    var status = statusFilter ? statusFilter.value : '';
    table.querySelectorAll('tbody tr').forEach(function (row) {
      var matchesQuery = row.textContent.toLowerCase().includes(query);
      var matchesStatus = !status || row.getAttribute('data-status') === status;
      row.hidden = !(matchesQuery && matchesStatus);
    });
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (statusFilter) statusFilter.addEventListener('change', applyFilters);

  // ---------- Modal open/close ----------
  document.querySelectorAll('[data-modal-open]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var modal = document.getElementById(btn.dataset.modalOpen);
      if (modal) modal.classList.add('is-open');
    });
  });
  document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var modal = btn.closest('.modal-backdrop');
      if (modal) modal.classList.remove('is-open');
    });
  });
  document.querySelectorAll('.modal-backdrop').forEach(function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) modal.classList.remove('is-open');
    });
  });

  // ---------- Roster ----------
  // availability_status -> the label and badge modifier the design system uses.
  var STATUS = {
    available:   { label: 'Available',   badge: 'active' },
    busy:        { label: 'Busy',        badge: 'pending' },
    unavailable: { label: 'Unavailable', badge: 'rejected' }
  };

  function cell(text, strong) {
    var td = document.createElement('td');
    if (strong) {
      var b = document.createElement('strong');
      b.textContent = text;
      td.appendChild(b);
    } else {
      td.textContent = text;
    }
    return td;
  }

  function messageRow(text) {
    var tr = document.createElement('tr');
    var td = cell(text);
    td.colSpan = 5;
    tr.appendChild(td);
    return tr;
  }

  function renderTechnicians(technicians) {
    tableBody.textContent = '';
    if (technicians.length === 0) {
      tableBody.appendChild(messageRow('No maintenance technicians registered yet.'));
      return;
    }
    technicians.forEach(function (t) {
      var status = STATUS[t.availability_status] ||
        { label: t.availability_status, badge: 'pending' };

      var categories = t.specialization || '';
      if (t.years_experience !== null && t.years_experience !== undefined) {
        categories += ' · ' + t.years_experience + ' yrs experience';
      }

      var tr = document.createElement('tr');
      tr.setAttribute('data-status', t.availability_status);
      tr.appendChild(cell(t.full_name, true));
      tr.appendChild(cell(t.phone + ' · ' + t.email));
      tr.appendChild(cell(categories));

      var statusCell = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'badge-status badge-status--' + status.badge;
      badge.textContent = status.label;
      statusCell.appendChild(badge);
      tr.appendChild(statusCell);

      var actions = document.createElement('td');
      var wrap = document.createElement('div');
      wrap.className = 'row-actions';
      var view = document.createElement('button');
      view.className = 'btn-outline btn-sm';
      view.type = 'button';
      view.textContent = 'View';
      view.addEventListener('click', function () {
        window.showToast(t.full_name + ' — profile view is coming soon.');
      });
      wrap.appendChild(view);
      actions.appendChild(wrap);
      tr.appendChild(actions);

      tableBody.appendChild(tr);
    });
    applyFilters();
  }

  function loadTechnicians() {
    EquipifyApi.get('/area-manager/technicians').then(function (res) {
      if (res.ok) {
        renderTechnicians(res.data);
      } else {
        tableBody.textContent = '';
        tableBody.appendChild(messageRow(res.error));
      }
    });
  }
  if (tableBody) loadTechnicians();

  // ---------- Register maintenance technician form ----------
  var technicianForm = document.getElementById('technicianForm');
  if (technicianForm && tableBody) {
    var formError = document.getElementById('technicianFormError');
    var submitBtn = technicianForm.querySelector('button[type="submit"]');

    technicianForm.addEventListener('submit', function (event) {
      event.preventDefault();
      formError.hidden = true;
      if (!technicianForm.checkValidity()) {
        technicianForm.reportValidity();
        return;
      }
      submitBtn.disabled = true;
      EquipifyApi.post('/area-manager/technicians', {
        full_name: technicianForm.elements.full_name.value,
        email: technicianForm.elements.email.value,
        phone: technicianForm.elements.phone.value,
        specialization: technicianForm.elements.specialization.value,
        // Optional field: send null rather than '' when it was left blank.
        years_experience: technicianForm.elements.years_experience.value || null,
        password: technicianForm.elements.password.value
      }).then(function (res) {
        submitBtn.disabled = false;
        if (!res.ok) {
          // The API answers with a per-field map; show them all at once.
          var details = Object.keys(res.fields).map(function (k) { return res.fields[k]; });
          formError.textContent = details.length ? details.join(' ') : res.error;
          formError.hidden = false;
          return;
        }
        window.showToast(technicianForm.dataset.successMessage);
        technicianForm.closest('.modal-backdrop').classList.remove('is-open');
        technicianForm.reset();
        loadTechnicians();
      });
    });
  }
})();
