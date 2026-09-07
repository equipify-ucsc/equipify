/* ==========================================================================
   Equipify — Renting Party My Equipment
   Mobile navigation drawer (shared shell behavior) + equipment search/filter
   Vanilla JS, no dependencies.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------- Mobile navigation drawer ---------------- */
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
      if (firstFocusable) firstFocusable.focus();

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

    sidenav.querySelectorAll('.sidenav-link, .btn-cta').forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.matchMedia('(max-width: 767px)').matches) closeNav();
      });
    });

    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width: 768px)').matches && sidenav.classList.contains('is-open')) {
        closeNav();
      }
    });
  }

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
