/* ==========================================================================
   Equipify — Delivery Personnel (Area Manager)
   Mobile navigation drawer, roster table search/filter, and the
   register-personnel modal wired to the API (vanilla JS, no dependencies).

   The roster is whatever GET /area-manager/delivery-personnel returns for the
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
  var table = document.getElementById('personnelTable');
  var tableBody = table ? table.querySelector('tbody') : null;
  var searchInput = document.querySelector('[data-filter-table="personnelTable"]');
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

  function renderPersonnel(people) {
    tableBody.textContent = '';
    if (people.length === 0) {
      tableBody.appendChild(messageRow('No delivery personnel registered yet.'));
      return;
    }
    people.forEach(function (p) {
      var status = STATUS[p.availability_status] ||
        { label: p.availability_status, badge: 'pending' };

      var tr = document.createElement('tr');
      tr.setAttribute('data-status', p.availability_status);
      tr.appendChild(cell(p.full_name, true));
      tr.appendChild(cell(p.phone + ' · ' + p.email));
      tr.appendChild(cell(
        p.driving_license_no + ' (' + p.license_class + ') · expires ' + p.license_expiry
      ));

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
        window.showToast(p.full_name + ' — profile view is coming soon.');
      });
      wrap.appendChild(view);
      actions.appendChild(wrap);
      tr.appendChild(actions);

      tableBody.appendChild(tr);
    });
    applyFilters();
  }

  function loadPersonnel() {
    EquipifyApi.get('/area-manager/delivery-personnel').then(function (res) {
      if (res.ok) {
        renderPersonnel(res.data);
      } else {
        tableBody.textContent = '';
        tableBody.appendChild(messageRow(res.error));
      }
    });
  }
  if (tableBody) loadPersonnel();

  // ---------- Register delivery personnel form ----------
  var personnelForm = document.getElementById('personnelForm');
  if (personnelForm && tableBody) {
    var formError = document.getElementById('personnelFormError');
    var submitBtn = personnelForm.querySelector('button[type="submit"]');

    personnelForm.addEventListener('submit', function (event) {
      event.preventDefault();
      formError.hidden = true;
      if (!personnelForm.checkValidity()) {
        personnelForm.reportValidity();
        return;
      }
      submitBtn.disabled = true;
      EquipifyApi.post('/area-manager/delivery-personnel', {
        full_name: personnelForm.elements.full_name.value,
        email: personnelForm.elements.email.value,
        phone: personnelForm.elements.phone.value,
        driving_license_no: personnelForm.elements.driving_license_no.value,
        license_class: personnelForm.elements.license_class.value,
        license_expiry: personnelForm.elements.license_expiry.value,
        password: personnelForm.elements.password.value
      }).then(function (res) {
        submitBtn.disabled = false;
        if (!res.ok) {
          // The API answers with a per-field map; show them all at once.
          var details = Object.keys(res.fields).map(function (k) { return res.fields[k]; });
          formError.textContent = details.length ? details.join(' ') : res.error;
          formError.hidden = false;
          return;
        }
        window.showToast(personnelForm.dataset.successMessage);
        personnelForm.closest('.modal-backdrop').classList.remove('is-open');
        personnelForm.reset();
        loadPersonnel();
      });
    });
  }
})();
