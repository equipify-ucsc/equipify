/* ==========================================================================
   Equipify — Technician Dashboard
   Mobile navigation drawer + job status editing (vanilla JS, no dependencies)
   ========================================================================== */

(function () {
  'use strict';

  // ---------- Job status filtering ----------
  var filterTabs = document.querySelectorAll('.filter-tab');
  var grid = document.getElementById('job-grid');
  var noResults = document.getElementById('job-grid-no-results');
  var activeFilter = 'all';

  function applyFilter() {
    if (!grid) return;
    var visibleCount = 0;

    grid.querySelectorAll('.job-card').forEach(function (card) {
      var isMatch = activeFilter === 'all' || card.getAttribute('data-status') === activeFilter;
      card.hidden = !isMatch;
      if (isMatch) visibleCount += 1;
    });

    if (noResults) {
      noResults.hidden = visibleCount !== 0;
    }
  }

  filterTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      filterTabs.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      activeFilter = tab.getAttribute('data-filter');
      applyFilter();
    });
  });

  // ---------- Job status editing ----------
  var STATUS_MAP = {
    'active': { badgeClass: 'badge-status--active', label: 'Active' },
    'in-progress': { badgeClass: 'badge-status--pending', label: 'In Progress' },
    'on-hold': { badgeClass: 'badge-status--draft', label: 'On Hold' },
    'completed': { badgeClass: 'badge-status--completed', label: 'Completed' }
  };

  document.querySelectorAll('[data-status-select]').forEach(function (select) {
    select.addEventListener('change', function () {
      var jobCard = select.closest('.job-card');
      var badge = jobCard && jobCard.querySelector('[data-status-badge]');
      var status = STATUS_MAP[select.value];
      if (!jobCard || !badge || !status) return;

      Object.keys(STATUS_MAP).forEach(function (key) {
        badge.classList.remove(STATUS_MAP[key].badgeClass);
      });
      badge.classList.add(status.badgeClass);
      badge.lastChild.textContent = ' ' + status.label;

      jobCard.setAttribute('data-status', select.value);
      applyFilter();
    });
  });
})();
