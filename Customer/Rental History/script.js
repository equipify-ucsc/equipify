/* ==========================================================================
   Equipify — Customer Rental History
   Mobile navigation drawer behavior (vanilla JS, no dependencies)
   ========================================================================== */

(function () {
  'use strict';

  var sidenav = document.getElementById('sidenav');
  var overlay = document.getElementById('sidenavOverlay');
  var openBtn = document.getElementById('menuOpenBtn');
  var closeBtn = document.getElementById('menuCloseBtn');

  if (!sidenav || !overlay || !openBtn || !closeBtn) return;

  var focusableSelector = 'a[href], button:not([disabled])';
  var lastFocusedElement = null;

  function openNav() {
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
  }

  function closeNav() {
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
  }

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
})();

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
