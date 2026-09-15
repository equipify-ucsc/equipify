/* ==========================================================================
   Equipify — Renting Party Rental Requests
   Table status filter and pagination interactions. Vanilla JS, no
   dependencies. Mobile navigation drawer behavior now lives in
   ../../shared/script.js.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------- Page interactions ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var statusFilter = document.getElementById('statusFilter');
    var tableRows = document.querySelectorAll('.rentals-table tbody tr');
    var paginationBtns = document.querySelectorAll('.pagination-btn');

    if (statusFilter) {
      statusFilter.addEventListener('change', function (event) {
        var selectedStatus = event.target.value.toLowerCase();

        tableRows.forEach(function (row) {
          var badge = row.querySelector('.badge-status');
          if (!badge) return;

          var statusText = badge.textContent.trim().toLowerCase();
          row.hidden = !(selectedStatus === 'all' || statusText === selectedStatus);
        });
      });
    }

    paginationBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('disabled')) return;

        paginationBtns.forEach(function (b) { b.classList.remove('active'); });
        if (!isNaN(btn.textContent.trim())) {
          btn.classList.add('active');
        }
      });
    });
  });
})();
