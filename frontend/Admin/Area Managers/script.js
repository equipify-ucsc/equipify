/* ==========================================================================
   Equipify — Area Managers
   Mobile navigation drawer + table search filter + register-manager modal
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

  // ---------- Table search filter ----------
  document.querySelectorAll('[data-filter-table]').forEach(function (input) {
    input.addEventListener('input', function () {
      var target = document.getElementById(input.dataset.filterTable);
      if (!target) return;
      var query = input.value.toLowerCase();
      target.querySelectorAll('tbody tr').forEach(function (row) {
        row.hidden = !row.textContent.toLowerCase().includes(query);
      });
    });
  });

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

  function renderManagers(managers) {
    tableBody.textContent = '';
    if (managers.length === 0) {
      var empty = document.createElement('tr');
      var td = cell('No area managers registered yet.');
      td.colSpan = 5;
      empty.appendChild(td);
      tableBody.appendChild(empty);
      return;
    }
    managers.forEach(function (m) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(m.full_name, true));
      tr.appendChild(cell(m.district || ''));
      tr.appendChild(cell(m.email));
      tr.appendChild(cell(m.phone));
      var status = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'badge-status badge-status--' + (m.account_status === 'active' ? 'active' : 'pending');
      badge.textContent = m.account_status.charAt(0).toUpperCase() + m.account_status.slice(1);
      status.appendChild(badge);
      tr.appendChild(status);
      tableBody.appendChild(tr);
    });
  }

  function loadManagers() {
    EquipifyApi.get('/admin/area-managers').then(function (res) {
      if (res.ok) {
        renderManagers(res.data);
      } else {
        tableBody.innerHTML = '';
        var tr = document.createElement('tr');
        var td = cell(res.error);
        td.colSpan = 5;
        tr.appendChild(td);
        tableBody.appendChild(tr);
      }
    });
  }
  if (tableBody) loadManagers();

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
