/* ==========================================================================
   Equipify — Renting Party My Equipment
   Equipment search/filter and load-more behavior. Vanilla JS, no
   dependencies. Mobile navigation drawer behavior now lives in
   ../../shared/script.js.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------- Equipment search / filter ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var searchInput = document.getElementById('equipmentSearch');
    var categoryFilter = document.getElementById('categoryFilter');
    var statusFilter = document.getElementById('statusFilter');
    var equipmentGrid = document.getElementById('equipmentGrid');
    var emptyState = document.getElementById('emptyState');
    if (!searchInput || !equipmentGrid) return;

    var cards = equipmentGrid.querySelectorAll('.equipment-card');
    var loadMoreBtn = document.getElementById('loadMoreBtn');

    function filterEquipment() {
      var searchTerm = searchInput.value.toLowerCase();
      var categoryValue = categoryFilter.value.toLowerCase();
      var statusValue = statusFilter.value.toLowerCase();
      var visibleCount = 0;

      cards.forEach(function (card) {
        var title = card.querySelector('h3').textContent.toLowerCase();
        var category = card.querySelector('.card-category').textContent.toLowerCase();
        var statusBadge = card.querySelector('.status-badge').textContent.toLowerCase();

        var matchesSearch = title.includes(searchTerm);
        var matchesCategory = categoryValue === 'all' || category.includes(categoryValue);
        var matchesStatus = statusValue === 'all' || statusBadge.replace(' ', '-').includes(statusValue);
        var visible = matchesSearch && matchesCategory && matchesStatus;

        card.hidden = !visible;
        if (visible) visibleCount += 1;
      });

      if (emptyState) emptyState.hidden = visibleCount !== 0;
    }

    searchInput.addEventListener('input', filterEquipment);
    categoryFilter.addEventListener('change', filterEquipment);
    statusFilter.addEventListener('change', filterEquipment);

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function () {
        loadMoreBtn.textContent = 'Loading…';
        setTimeout(function () {
          loadMoreBtn.textContent = 'No More Equipment to Load';
          loadMoreBtn.disabled = true;
        }, 700);
      });
    }
  });
})();
