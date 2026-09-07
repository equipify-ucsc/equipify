/* ==========================================================================
   Equipify — Technician Dashboard
   Mobile navigation drawer + job status editing (vanilla JS, no dependencies)
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
