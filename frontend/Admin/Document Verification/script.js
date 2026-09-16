/* ==========================================================================
   Equipify — Document Verification
   Mobile navigation drawer + table search/status filter + approve/reject
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

  // ---------- Table status filter ----------
  document.querySelectorAll('[data-status-filter]').forEach(function (select) {
    select.addEventListener('change', function () {
      var target = document.getElementById(select.dataset.statusFilter);
      if (!target) return;
      var query = select.value.toLowerCase();
      target.querySelectorAll('tbody tr').forEach(function (row) {
        var status = (row.dataset.status || row.textContent).toLowerCase();
        row.hidden = Boolean(query) && !status.includes(query);
      });
    });
  });

  // ---------- Approve / reject actions ----------
  document.querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.dataset.action;
      var row = btn.closest('tr');
      var badge = row && row.querySelector('.badge-status');
      if (badge) {
        badge.textContent = action === 'approve' ? 'Verified' : 'Rejected';
        badge.className = 'badge-status ' + (action === 'approve' ? 'badge-status--active' : 'badge-status--rejected');
      }
      window.showToast(action === 'approve' ? 'Document verified successfully.' : 'Document rejected.');
    });
  });

  // ---------- Generic "View" / "Review" buttons ----------
  document.querySelectorAll('[data-toast]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.showToast(btn.dataset.toast);
    });
  });
})();
