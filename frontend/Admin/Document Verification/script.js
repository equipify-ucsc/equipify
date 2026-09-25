/* ==========================================================================
   Equipify — Document Verification
   Combined table search/status/role filters + approve/reject
   actions (vanilla JS, no dependencies)
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

  // ---------- Combined table filters ----------
  function applyFilters(tableId) {
    var table = document.getElementById(tableId);
    if (!table) return;
    var searchInput = document.querySelector('[data-filter-table="' + tableId + '"]');
    var statusFilter = document.querySelector('[data-status-filter="' + tableId + '"]');
    var roleFilter = document.querySelector('[data-role-filter="' + tableId + '"]');
    var search = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var status = statusFilter ? statusFilter.value.toLowerCase() : '';
    var role = roleFilter ? roleFilter.value.toLowerCase() : '';

    table.querySelectorAll('tbody tr').forEach(function (row) {
      row.hidden = (Boolean(search) && !row.textContent.toLowerCase().includes(search)) ||
        (Boolean(status) && (row.dataset.status || '').toLowerCase() !== status) ||
        (Boolean(role) && (row.dataset.role || '').toLowerCase() !== role);
    });
  }

  document.querySelectorAll('[data-filter-table], [data-status-filter], [data-role-filter]').forEach(function (control) {
    var tableId = control.dataset.filterTable || control.dataset.statusFilter || control.dataset.roleFilter;
    control.addEventListener(control.dataset.filterTable ? 'input' : 'change', function () {
      applyFilters(tableId);
    });
    applyFilters(tableId);
  });

  // ---------- Approve / reject actions ----------
  document.querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.dataset.action;
      var row = btn.closest('tr');
      var badge = row && row.querySelector('.badge-status');
      if (badge) {
        row.dataset.status = action === 'approve' ? 'Verified' : 'Rejected';
        badge.textContent = row.dataset.status;
        badge.className = 'badge-status ' + (action === 'approve' ? 'badge-status--active' : 'badge-status--rejected');
      }
      if (row) applyFilters(row.closest('table').id);
      window.showToast(action === 'approve' ? 'Document verified successfully.' : 'Document rejected.');
    });
  });

  // ---------- Document links ----------
  // Set href to the document's existing browser URL when rendering a row.
  // Missing URLs must not fall back to the uploads directory or the current page.
  document.querySelectorAll('[data-document-link]').forEach(function (link) {
    var href = (link.getAttribute('href') || '').trim();
    if (!href) {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.textContent = 'Document unavailable';
      link.title = 'No document URL is available';
      return;
    }
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View Document';
    link.title = 'Open document in a new tab';
    link.removeAttribute('aria-disabled');
  });
})();
