/* ==========================================================================
   Equipify — Vehicle Management (Area Manager)
   Mobile navigation drawer, fleet table search/filter, and add/edit/remove
   vehicle actions (vanilla JS, no dependencies)
   ========================================================================== */

(function () {
  'use strict';

  var sidenav = document.getElementById('sidenav');
  var overlay = document.getElementById('sidenavOverlay');
  var openBtn = document.getElementById('menuOpenBtn');
  var closeBtn = document.getElementById('menuCloseBtn');

  if (sidenav && overlay && openBtn && closeBtn) {
    var focusableSelector = 'a[href], button:not([disabled])';
    var lastFocusedElement = null;

    var openNav = function () {
      lastFocusedElement = document.activeElement;
      sidenav.classList.add('is-open');
      overlay.classList.add('is-open');
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';

      var firstFocusable = sidenav.querySelector(focusableSelector);
      if (firstFocusable) {
        firstFocusable.focus();
      }

      document.addEventListener('keydown', onKeydown);
    };

    var closeNav = function () {
      sidenav.classList.remove('is-open');
      overlay.classList.remove('is-open');
      openBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';

      document.removeEventListener('keydown', onKeydown);

      if (lastFocusedElement) {
        lastFocusedElement.focus();
      } else {
        openBtn.focus();
      }
    };

    function onKeydown(event) {
      if (event.key === 'Escape') {
        closeNav();
        return;
      }

      if (event.key === 'Tab') {
        var focusableEls = sidenav.querySelectorAll(focusableSelector);
        if (focusableEls.length === 0) return;

        var firstEl = focusableEls[0];
        var lastEl = focusableEls[focusableEls.length - 1];

        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    }

    openBtn.addEventListener('click', openNav);
    closeBtn.addEventListener('click', closeNav);
    overlay.addEventListener('click', closeNav);

    sidenav.querySelectorAll('.sidenav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.matchMedia('(max-width: 767px)').matches) {
          closeNav();
        }
      });
    });

    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width: 768px)').matches && sidenav.classList.contains('is-open')) {
        closeNav();
      }
    });
  }

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
  var table = document.getElementById('vehicleTable');
  var searchInput = document.querySelector('[data-filter-table="vehicleTable"]');
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

  // ---------- Status badge helper ----------
  var STATUS_BADGE_CLASS = {
    'Available': 'badge-status--active',
    'In Use': 'badge-status--pending',
    'Maintenance': 'badge-status--rejected'
  };

  function buildBadge(status) {
    var cls = STATUS_BADGE_CLASS[status] || 'badge-status--completed';
    return '<span class="badge-status ' + cls + '">' + status + '</span>';
  }

  // ---------- Add / edit vehicle modal ----------
  var modal = document.getElementById('vehicleModal');
  var modalTitle = document.getElementById('vehicleModalTitle');
  var vehicleForm = document.getElementById('vehicleForm');
  var vehicleFormSubmit = document.getElementById('vehicleFormSubmit');
  var addVehicleBtn = document.getElementById('addVehicleBtn');

  var plateInput = document.getElementById('vehiclePlate');
  var typeInput = document.getElementById('vehicleType');
  var capacityInput = document.getElementById('vehicleCapacity');
  var statusInput = document.getElementById('vehicleStatus');
  var driverInput = document.getElementById('vehicleDriver');

  var editingRow = null;

  function openModalForAdd() {
    editingRow = null;
    vehicleForm.reset();
    modalTitle.textContent = 'Add Vehicle';
    vehicleFormSubmit.textContent = 'Add Vehicle';
    vehicleForm.dataset.successMessage = 'Vehicle added to the fleet.';
    modal.classList.add('is-open');
  }

  function openModalForEdit(row) {
    editingRow = row;
    plateInput.value = row.getAttribute('data-plate');
    typeInput.value = row.getAttribute('data-type');
    capacityInput.value = row.getAttribute('data-capacity');
    statusInput.value = row.getAttribute('data-status');
    driverInput.value = row.getAttribute('data-driver');
    modalTitle.textContent = 'Edit Vehicle';
    vehicleFormSubmit.textContent = 'Save Changes';
    vehicleForm.dataset.successMessage = 'Vehicle details updated.';
    modal.classList.add('is-open');
  }

  if (addVehicleBtn) {
    addVehicleBtn.addEventListener('click', openModalForAdd);
  }

  document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      modal.classList.remove('is-open');
    });
  });
  modal.addEventListener('click', function (event) {
    if (event.target === modal) modal.classList.remove('is-open');
  });

  function attachRowActions(row) {
    row.querySelector('.row-edit-btn').addEventListener('click', function () {
      openModalForEdit(row);
    });
    row.querySelector('.row-remove-btn').addEventListener('click', onRemoveRow);
  }

  function renderRow(row, data) {
    row.setAttribute('data-status', data.status);
    row.setAttribute('data-plate', data.plate);
    row.setAttribute('data-type', data.type);
    row.setAttribute('data-capacity', data.capacity);
    row.setAttribute('data-driver', data.driver);
    row.innerHTML =
      '<td><strong></strong></td>' +
      '<td></td>' +
      '<td></td>' +
      '<td></td>' +
      '<td>' + buildBadge(data.status) + '</td>' +
      '<td><div class="row-actions">' +
      '<button class="btn-outline btn-sm row-edit-btn" type="button">Edit</button>' +
      '<button class="btn-outline btn-sm row-remove-btn" type="button">Remove</button>' +
      '</div></td>';
    var cells = row.querySelectorAll('td');
    cells[0].querySelector('strong').textContent = data.plate;
    cells[1].textContent = data.type;
    cells[2].textContent = data.capacity;
    cells[3].textContent = data.driver || 'Unassigned';
    attachRowActions(row);
  }

  if (vehicleForm) {
    vehicleForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!vehicleForm.checkValidity()) {
        vehicleForm.reportValidity();
        return;
      }

      var data = {
        plate: plateInput.value.trim().toUpperCase(),
        type: typeInput.value,
        capacity: capacityInput.value.trim(),
        status: statusInput.value,
        driver: driverInput.value.trim()
      };

      if (editingRow) {
        renderRow(editingRow, data);
      } else {
        var tbody = table.querySelector('tbody');
        var row = document.createElement('tr');
        tbody.appendChild(row);
        renderRow(row, data);
      }

      applyFilters();
      window.showToast(vehicleForm.dataset.successMessage || 'Changes saved successfully.');
      modal.classList.remove('is-open');
      vehicleForm.reset();
      editingRow = null;
    });
  }

  // ---------- Remove row ----------
  function onRemoveRow() {
    var row = this.closest('tr');
    var plate = row.getAttribute('data-plate');
    if (window.confirm('Remove vehicle ' + plate + ' from the fleet?')) {
      row.remove();
      window.showToast('Vehicle ' + plate + ' removed from the fleet.');
    }
  }

  table.querySelectorAll('tbody tr').forEach(attachRowActions);
})();
