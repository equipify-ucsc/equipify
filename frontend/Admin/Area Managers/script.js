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
  document.querySelectorAll('.modal-backdrop:not(#areaModal):not(#managerAreaModal)').forEach(function (modal) {
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
      td.colSpan = 7;
      empty.appendChild(td);
      tableBody.appendChild(empty);
      return;
    }
    managers.forEach(function (m) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(m.full_name, true));
      tr.appendChild(cell(m.district || ''));
      tr.appendChild(cell(m.area_name || 'Unassigned'));
      tr.appendChild(cell(m.email));
      tr.appendChild(cell(m.phone));
      var status = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'badge-status badge-status--' + (m.account_status === 'active' ? 'active' : 'pending');
      badge.textContent = m.account_status.charAt(0).toUpperCase() + m.account_status.slice(1);
      status.appendChild(badge);
      tr.appendChild(status);
      var actions = document.createElement('td');
      var assign = document.createElement('button');
      assign.type = 'button';
      assign.className = 'btn-outline btn-sm';
      assign.textContent = m.area_id === null ? 'Assign Area' : 'Change Area';
      assign.setAttribute('aria-label', assign.textContent + ' for ' + m.full_name);
      assign.addEventListener('click', function () { openAssignment(m); });
      actions.appendChild(assign);
      tr.appendChild(actions);
      tableBody.appendChild(tr);
    });
    var search = document.querySelector('[data-filter-table="managerTable"]');
    if (search) search.dispatchEvent(new Event('input'));
  }

  function loadManagers() {
    EquipifyApi.get('/admin/area-managers').then(function (res) {
      if (res.ok) {
        renderManagers(res.data);
      } else {
        tableBody.innerHTML = '';
        var tr = document.createElement('tr');
        var td = cell(res.error);
        td.colSpan = 7;
        tr.appendChild(td);
        tableBody.appendChild(tr);
      }
    });
  }
  if (tableBody) loadManagers();

  // Area assignments do not alter registration history, district or account status.
  var assignmentModal = document.getElementById('managerAreaModal');
  var assignmentForm = document.getElementById('managerAreaForm');
  var assignmentSelect = document.getElementById('managerAreaSelect');
  var assignmentSave = document.getElementById('managerAreaSave');
  var assignmentError = document.getElementById('managerAreaError');
  var assignmentSelection = document.getElementById('managerAreaSelection');
  var assignmentManager = null, assignmentFocus = null, assignmentSaving = false, assignmentRequest = 0;

  function shortAreaLabel(name, id) {
    // Grapheme-aware truncation preserves emoji/combining characters. IDs stay intact.
    var characters = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name), function (part) { return part.segment; })
      : Array.from(name);
    return (characters.length > 12 ? characters.slice(0, 12).join('') + '…' : name) + ' [' + id + ']';
  }
  function showAreaSelection() {
    var option = assignmentSelect.options[assignmentSelect.selectedIndex];
    var label = option ? (option.title || option.textContent) : '';
    assignmentSelect.title = label;
    assignmentSelection.textContent = label;
  }

  function openAssignment(manager) {
    if (assignmentSaving) return;
    assignmentManager = manager;
    assignmentFocus = document.activeElement;
    assignmentError.hidden = true;
    document.getElementById('managerAreaTitle').textContent = manager.area_id === null ? 'Assign Area' : 'Change Area';
    document.getElementById('managerAreaContext').textContent = manager.full_name + ' — Current area: ' + (manager.area_name || 'Unassigned');
    assignmentSelect.textContent = '';
    assignmentSelect.appendChild(new Option('Loading active areas...', ''));
    assignmentSelect.disabled = true; assignmentSave.disabled = true;
    showAreaSelection();
    assignmentModal.classList.add('is-open');
    assignmentModal.querySelector('[data-assignment-close]').focus();
    var request = ++assignmentRequest;
    // Fetch on every open so Step 1A area edits and status changes are reflected.
    EquipifyApi.get('/admin/areas').then(function (res) {
      if (request !== assignmentRequest) return;
      if (!res.ok) {
        assignmentError.textContent = res.error + ' Close and reopen to retry.';
        assignmentError.hidden = false; return;
      }
      assignmentSelect.textContent = '';
      assignmentSelect.appendChild(new Option('Unassigned', ''));
      var active = res.data.filter(function (area) { return area.is_active; });
      active.forEach(function (area) {
        var option = new Option(shortAreaLabel(area.name, area.area_id), String(area.area_id));
        option.title = area.name;
        assignmentSelect.appendChild(option);
      });
      var currentActive = active.some(function (area) { return area.area_id === manager.area_id; });
      if (manager.area_id !== null && !currentActive) {
        var current = new Option('Current area inactive', '__current__');
        current.title = 'Choose an active area or Unassigned.';
        current.disabled = true; assignmentSelect.appendChild(current); assignmentSelect.value = '__current__';
      } else {
        assignmentSelect.value = manager.area_id === null ? '' : String(manager.area_id);
        assignmentSave.disabled = false;
      }
      assignmentSelect.disabled = false; assignmentSelect.focus();
      showAreaSelection();
    });
  }
  function closeAssignment() {
    if (assignmentSaving) return;
    assignmentRequest++;
    assignmentModal.classList.remove('is-open');
    if (assignmentFocus && assignmentFocus.isConnected) assignmentFocus.focus();
  }
  assignmentSelect.addEventListener('change', function () {
    assignmentSave.disabled = assignmentSaving || assignmentSelect.value === '__current__';
    showAreaSelection();
  });
  assignmentModal.querySelectorAll('[data-assignment-close]').forEach(function (button) { button.addEventListener('click', closeAssignment); });
  assignmentModal.addEventListener('click', function (event) { if (event.target === assignmentModal) closeAssignment(); });
  assignmentModal.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeAssignment();
    if (event.key !== 'Tab') return;
    var controls = Array.from(assignmentModal.querySelectorAll('button:not(:disabled), select:not(:disabled)'));
    var first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  assignmentForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (assignmentSaving || assignmentSave.disabled || assignmentSelect.disabled || !assignmentManager) return;
    var areaId = assignmentSelect.value === '' ? null : Number(assignmentSelect.value);
    assignmentSaving = true; assignmentSave.disabled = true; assignmentSelect.disabled = true; assignmentError.hidden = true;
    EquipifyApi.put('/admin/area-managers/' + assignmentManager.user_id + '/area', { area_id: areaId }).then(function (res) {
      assignmentSaving = false; assignmentSave.disabled = false; assignmentSelect.disabled = false;
      if (!res.ok) {
        assignmentError.textContent = Object.values(res.fields || {}).join(' ') || res.error;
        assignmentError.hidden = false; return;
      }
      closeAssignment();
      window.showToast(res.data.area_id === null ? 'Area assignment removed.' : 'Area assignment saved.');
      loadManagers();
    });
  });

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
