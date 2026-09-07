/* ==========================================================================
   Equipify — Maintenance Technicians (Area Manager)
   Mobile navigation drawer, roster table search/filter, register-technician
   modal, and remove-row action (vanilla JS, no dependencies)
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

  // ---------- Generic "View" style buttons ----------
  document.querySelectorAll('[data-toast]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.showToast(btn.dataset.toast);
    });
  });

  // ---------- Table search + status filter ----------
  var table = document.getElementById('technicianTable');
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

  // ---------- Register technician form ----------
  var technicianForm = document.getElementById('technicianForm');
  if (technicianForm && table) {
    technicianForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!technicianForm.checkValidity()) {
        technicianForm.reportValidity();
        return;
      }

      var name = document.getElementById('technicianName').value.trim();
      var phone = document.getElementById('technicianPhone').value.trim();
      var categories = document.getElementById('technicianCategories').value.trim();

      var tbody = table.querySelector('tbody');
      var row = document.createElement('tr');
      row.setAttribute('data-status', 'Active');
      row.innerHTML =
        '<td><strong></strong></td>' +
        '<td></td>' +
        '<td></td>' +
        '<td>0</td>' +
        '<td><span class="badge-status badge-status--active">Active</span></td>' +
        '<td><div class="row-actions">' +
        '<button class="btn-outline btn-sm" type="button">View</button>' +
        '<button class="btn-outline btn-sm row-remove-btn" type="button">Remove</button>' +
        '</div></td>';
      row.querySelector('strong').textContent = name;
      row.querySelectorAll('td')[1].textContent = phone;
      row.querySelectorAll('td')[2].textContent = categories;
      row.querySelector('.btn-outline.btn-sm:not(.row-remove-btn)').addEventListener('click', function () {
        window.showToast(name + "'s profile opened.");
      });
      row.querySelector('.row-remove-btn').addEventListener('click', onRemoveRow);
      tbody.appendChild(row);
      applyFilters();

      window.showToast(technicianForm.dataset.successMessage || 'Changes saved successfully.');
      var modal = technicianForm.closest('.modal-backdrop');
      if (modal) modal.classList.remove('is-open');
      technicianForm.reset();
    });
  }

  // ---------- Remove row ----------
  function onRemoveRow() {
    var row = this.closest('tr');
    var name = row.querySelector('strong') ? row.querySelector('strong').textContent : 'Technician';
    if (window.confirm('Remove ' + name + ' from the technician roster?')) {
      row.remove();
      window.showToast(name + ' removed from the roster.');
    }
  }
  document.querySelectorAll('.row-remove-btn').forEach(function (btn) {
    btn.addEventListener('click', onRemoveRow);
  });
})();
