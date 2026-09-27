/* ==========================================================================
   Equipify — Area Managers
   Area manager list (search, district filter, status change) + register-manager
   modal
   (vanilla JS, no dependencies)
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

  // ---------- Generic "View" / "Approve" style buttons ----------
  document.querySelectorAll('[data-toast]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.showToast(btn.dataset.toast);
    });
  });

  // ---------- Area manager list ----------
  var tableBody = document.querySelector('#managerTable tbody');
  var districtFilter = document.getElementById('districtFilter');
  var searchInput = document.querySelector('[data-filter-table="managerTable"]');
  var managers = [];

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
    td.colSpan = 6;
    tr.appendChild(td);
    return tr;
  }

  function setStat(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  // The tiles count every manager, whatever the search or district filter shows.
  function renderStats() {
    var active = managers.filter(function (m) { return m.account_status === 'active'; });
    var districts = {};
    active.forEach(function (m) { if (m.district) districts[m.district] = true; });
    setStat('statActive', active.length);
    setStat('statInactive', managers.length - active.length);
    setStat('statDistricts', Object.keys(districts).length);
  }

  function managerRow(m) {
    var tr = document.createElement('tr');
    tr.appendChild(cell(m.full_name, true));
    tr.appendChild(cell(m.district || ''));
    tr.appendChild(cell(m.email));
    tr.appendChild(cell(m.phone));

    var status = document.createElement('td');
    status.appendChild(EquipifyAccountStatus.badge(m.account_status));
    tr.appendChild(status);

    var action = document.createElement('td');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-outline btn-sm';
    btn.textContent = 'Change status';
    btn.addEventListener('click', function () {
      EquipifyAccountStatus.open(m, loadManagers);
    });
    action.appendChild(btn);
    tr.appendChild(action);
    return tr;
  }

  // Search and district narrow the rows already loaded: the whole list comes
  // back in one response, so there is nothing to page.
  function renderManagers() {
    tableBody.textContent = '';
    if (managers.length === 0) {
      tableBody.appendChild(messageRow('No area managers registered yet.'));
      return;
    }
    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var district = districtFilter ? districtFilter.value : '';
    var shown = managers.filter(function (m) {
      if (district && m.district !== district) return false;
      if (!query) return true;
      return [m.full_name, m.district, m.email, m.phone].join(' ').toLowerCase().indexOf(query) !== -1;
    });
    if (shown.length === 0) {
      tableBody.appendChild(messageRow('No area managers match these filters.'));
      return;
    }
    shown.forEach(function (m) { tableBody.appendChild(managerRow(m)); });
  }

  function loadManagers() {
    EquipifyApi.get('/admin/area-managers').then(function (res) {
      if (!res.ok) {
        tableBody.textContent = '';
        tableBody.appendChild(messageRow(res.error));
        return;
      }
      managers = res.data;
      renderStats();
      renderManagers();
    });
  }
  if (tableBody) {
    loadManagers();
    if (districtFilter) districtFilter.addEventListener('change', renderManagers);
    if (searchInput) searchInput.addEventListener('input', renderManagers);
  }

  // ---------- Register area manager form (admin only; saved through the API) ----------
  var managerForm = document.getElementById('managerForm');
  if (managerForm) {
    var formError = document.getElementById('managerFormError');
    var submitBtn = managerForm.querySelector('button[type="submit"]');

    managerForm.addEventListener('submit', function (event) {
      event.preventDefault();
      formError.hidden = true;
      if (!managerForm.checkValidity()) {
        managerForm.reportValidity();
        return;
      }
      submitBtn.disabled = true;
      EquipifyApi.post('/admin/area-managers', {
        full_name: managerForm.elements.full_name.value,
        email: managerForm.elements.email.value,
        phone: managerForm.elements.phone.value,
        district: managerForm.elements.district.value,
        password: managerForm.elements.password.value
      }).then(function (res) {
        submitBtn.disabled = false;
        if (!res.ok) {
          var details = Object.keys(res.fields).map(function (k) { return res.fields[k]; });
          formError.textContent = details.length ? details.join(' ') : res.error;
          formError.hidden = false;
          return;
        }
        window.showToast(managerForm.dataset.successMessage);
        managerForm.closest('.modal-backdrop').classList.remove('is-open');
        managerForm.reset();
        loadManagers();
      });
    });
  }
})();
