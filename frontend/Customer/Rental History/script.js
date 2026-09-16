/* ==========================================================================
   Equipify — Customer Rental History
   Mobile navigation drawer behavior (vanilla JS, no dependencies)
   ========================================================================== */

/* ---- Status filter tabs ---- */
(function () {
  'use strict';

  var tabs = document.querySelectorAll('.filter-tab');
  var grid = document.getElementById('rental-history-grid');
  var noResults = document.getElementById('rental-history-no-results');

  if (!tabs.length || !grid) return;

  function applyFilter(filter) {
    var visibleCount = 0;

    grid.querySelectorAll('.entity-card').forEach(function (card) {
      var isMatch = filter === 'all' || card.getAttribute('data-status') === filter;
      card.hidden = !isMatch;
      if (isMatch) visibleCount += 1;
    });

    if (noResults) {
      noResults.hidden = visibleCount !== 0;
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      applyFilter(tab.getAttribute('data-filter'));
    });
  });
})();
