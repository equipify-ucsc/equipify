/* ==========================================================================
   Equipify — Vehicle Management (Area Manager)
   Fleet table search/filter, stat cards, and add/edit/remove/restore vehicle
   actions wired to the API (vanilla JS, no dependencies).

   The fleet is whatever GET /area-manager/vehicles returns for the signed-in
   area manager. Vehicles have no driver of their own: a vehicle and a delivery
   person are assigned separately for each delivery. Removing a vehicle that
   has delivery history retires it instead of deleting it; the server decides
   which and says so in the response.
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

  var table = document.getElementById('vehicleTable');
  var tableBody = table ? table.querySelector('tbody') : null;
  if (!tableBody) return;

  // ---------- Table search + status filter ----------
  // "All active" (empty value) hides retired vehicles; "Retired" shows only them.
  var searchInput = document.querySelector('[data-filter-table="vehicleTable"]');
  var statusFilter = document.getElementById('statusFilter');

  function applyFilters() {
    var query = (searchInput ? searchInput.value : '').toLowerCase();
    var status = statusFilter ? statusFilter.value : '';
    tableBody.querySelectorAll('tr[data-status]').forEach(function (row) {
      var rowStatus = row.getAttribute('data-status');
      var matchesQuery = row.textContent.toLowerCase().includes(query);
      var matchesStatus = status ? rowStatus === status : rowStatus !== 'retired';
      row.hidden = !(matchesQuery && matchesStatus);
    });
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (statusFilter) statusFilter.addEventListener('change', applyFilters);

  // ---------- Status -> label + badge modifier from the design system ----------
  var STATUS = {
    available:   { label: 'Available',   badge: 'active' },
    in_use:      { label: 'In Use',      badge: 'pending' },
    maintenance: { label: 'Maintenance', badge: 'rejected' },
    retired:     { label: 'Retired',     badge: 'draft' }
  };

  function rowStatus(v) {
    return v.retired ? 'retired' : v.status;
  }

  // ---------- Formatting ----------
  function formatKg(kg) {
    return kg.toLocaleString('en-LK') + ' kg';
  }

  function formatMetres(m) {
    return m.toFixed(2);
  }

  // ---------- Rendering ----------
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

  function actionButton(label, onClick, disabledReason) {
    var btn = document.createElement('button');
    btn.className = 'btn-outline btn-sm';
    btn.type = 'button';
    btn.textContent = label;
    if (disabledReason) {
      btn.disabled = true;
      btn.title = disabledReason;
    } else {
      btn.addEventListener('click', onClick);
    }
    return btn;
  }

  function renderRow(v) {
    var status = rowStatus(v);
    var meta = STATUS[status] || { label: status, badge: 'pending' };

    var tr = document.createElement('tr');
    tr.setAttribute('data-status', status);
    tr.appendChild(cell(v.plate_number, true));
    tr.appendChild(cell(v.type_label));
    tr.appendChild(cell(formatKg(v.max_load_kg)));
    tr.appendChild(cell(formatMetres(v.cargo_length_m) + ' × ' + formatMetres(v.cargo_width_m) + ' m'));

    var statusCell = document.createElement('td');
    var badge = document.createElement('span');
    badge.className = 'badge-status badge-status--' + meta.badge;
    badge.textContent = meta.label;
    statusCell.appendChild(badge);
    tr.appendChild(statusCell);

    var actions = document.createElement('td');
    var wrap = document.createElement('div');
    wrap.className = 'row-actions';
    if (v.retired) {
      wrap.appendChild(actionButton('Restore', function () { restoreVehicle(v); }));
    } else {
      wrap.appendChild(actionButton('Edit', function () { openModalForEdit(v); }));
      wrap.appendChild(actionButton(
        'Remove',
        function () { removeVehicle(v); },
        v.status === 'in_use' ? 'On an active delivery' : ''
      ));
    }
    actions.appendChild(wrap);
    tr.appendChild(actions);
    return tr;
  }

  function renderStats(vehicles) {
    var counts = { available: 0, in_use: 0, maintenance: 0, total: 0 };
    vehicles.forEach(function (v) {
      if (v.retired) return;
      counts.total += 1;
      if (counts[v.status] !== undefined) counts[v.status] += 1;
    });
    document.getElementById('statAvailable').textContent = counts.available;
    document.getElementById('statInUse').textContent = counts.in_use;
    document.getElementById('statMaintenance').textContent = counts.maintenance;
    document.getElementById('statTotal').textContent = counts.total;
  }

  function renderVehicles(vehicles) {
    tableBody.textContent = '';
    renderStats(vehicles);
    if (vehicles.length === 0) {
      tableBody.appendChild(messageRow('No vehicles in your fleet yet. Use "Add Vehicle" to add one.'));
      return;
    }
    vehicles.forEach(function (v) {
      tableBody.appendChild(renderRow(v));
    });
    applyFilters();
  }

  function loadVehicles() {
    EquipifyApi.get('/area-manager/vehicles').then(function (res) {
      if (res.ok) {
        renderVehicles(res.data);
      } else {
        tableBody.textContent = '';
        tableBody.appendChild(messageRow(res.error));
      }
    });
  }

  // ---------- Add / edit vehicle modal ----------
  var modal = document.getElementById('vehicleModal');
  var modalTitle = document.getElementById('vehicleModalTitle');
  var vehicleForm = document.getElementById('vehicleForm');
  var formError = document.getElementById('vehicleFormError');
  var submitBtn = document.getElementById('vehicleFormSubmit');
  var addVehicleBtn = document.getElementById('addVehicleBtn');
  var fields = vehicleForm.elements;

  var editingId = null;

  function openModal() {
    formError.hidden = true;
    modal.classList.add('is-open');
    fields.plate_number.focus();
  }

  function closeModal() {
    modal.classList.remove('is-open');
  }

  function openModalForAdd() {
    editingId = null;
    vehicleForm.reset();
    fields.status.disabled = false;
    modalTitle.textContent = 'Add Vehicle';
    submitBtn.textContent = 'Add Vehicle';
    openModal();
  }

  function openModalForEdit(v) {
    editingId = v.vehicle_id;
    vehicleForm.reset();
    fields.plate_number.value = v.plate_number;
    fields.vehicle_type.value = v.vehicle_type;
    fields.max_load_kg.value = v.max_load_kg;
    fields.cargo_length_m.value = formatMetres(v.cargo_length_m);
    fields.cargo_width_m.value = formatMetres(v.cargo_width_m);
    fields.status.value = v.status;
    // Only the delivery workflow takes a vehicle out of "in use".
    fields.status.disabled = v.status === 'in_use';
    modalTitle.textContent = 'Edit ' + v.plate_number;
    submitBtn.textContent = 'Save Changes';
    openModal();
  }

  addVehicleBtn.addEventListener('click', openModalForAdd);

  document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', closeModal);
  });
  modal.addEventListener('click', function (event) {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  vehicleForm.addEventListener('submit', function (event) {
    event.preventDefault();
    formError.hidden = true;
    if (!vehicleForm.checkValidity()) {
      vehicleForm.reportValidity();
      return;
    }

    var body = {
      plate_number: fields.plate_number.value,
      vehicle_type: fields.vehicle_type.value,
      max_load_kg: fields.max_load_kg.value,
      cargo_length_m: fields.cargo_length_m.value,
      cargo_width_m: fields.cargo_width_m.value,
      status: fields.status.value
    };
    var isEdit = editingId !== null;
    var request = isEdit
      ? EquipifyApi.put('/area-manager/vehicles/' + editingId, body)
      : EquipifyApi.post('/area-manager/vehicles', body);

    submitBtn.disabled = true;
    request.then(function (res) {
      submitBtn.disabled = false;
      if (!res.ok) {
        // The API answers with a per-field map; show them all at once.
        var details = Object.keys(res.fields).map(function (k) { return res.fields[k]; });
        formError.textContent = details.length ? details.join(' ') : res.error;
        formError.hidden = false;
        return;
      }
      window.showToast(isEdit
        ? 'Vehicle ' + res.data.plate_number + ' updated.'
        : 'Vehicle ' + res.data.plate_number + ' added to the fleet.');
      closeModal();
      vehicleForm.reset();
      editingId = null;
      loadVehicles();
    });
  });

  // ---------- Remove / restore ----------
  function removeVehicle(v) {
    var question = 'Remove vehicle ' + v.plate_number + ' from the fleet?\n\n' +
      'If it has delivery history it will be retired instead, and you can restore it later.';
    if (!window.confirm(question)) return;

    EquipifyApi.del('/area-manager/vehicles/' + v.vehicle_id).then(function (res) {
      if (!res.ok) {
        window.showToast(res.error);
        return;
      }
      window.showToast(res.data.outcome === 'retired'
        ? 'Vehicle ' + v.plate_number + ' has delivery history, so it was retired instead.'
        : 'Vehicle ' + v.plate_number + ' deleted.');
      loadVehicles();
    });
  }

  function restoreVehicle(v) {
    EquipifyApi.post('/area-manager/vehicles/' + v.vehicle_id + '/restore').then(function (res) {
      if (!res.ok) {
        window.showToast(res.error);
        return;
      }
      window.showToast('Vehicle ' + v.plate_number + ' is back in the fleet.');
      loadVehicles();
    });
  }

  loadVehicles();
})();
