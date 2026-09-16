/* ==========================================================================
   Equipify — Shared dashboard shell
   Mobile navigation drawer behavior (vanilla JS, no dependencies)

   Loaded via <script src="../../shared/script.js"></script> BEFORE each
   page's own script.js. Wires the topbar/sidenav mobile drawer that was
   previously copy-pasted verbatim into every dashboard-shell page's own
   script.js (IDs: sidenav, sidenavOverlay, menuOpenBtn, menuCloseBtn).

   NOT used by: Customer/Browsing page, Customer/Detailed page, or any
   Login/Register page (see shared/auth.js instead).
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

    // Basic focus trap while the drawer is open
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

  // Close the drawer if a nav link or the sidenav CTA is tapped (mobile
  // navigation pattern). Pages without a `.btn-cta` in the sidenav simply
  // match nothing for that half of the selector.
  sidenav.querySelectorAll('.sidenav-link, .btn-cta').forEach(function (link) {
    link.addEventListener('click', function () {
      if (window.matchMedia('(max-width: 767px)').matches) {
        closeNav();
      }
    });
  });

  // If the viewport grows past the mobile breakpoint while the drawer is
  // open, reset drawer state so desktop layout isn't left mid-transition.
  window.addEventListener('resize', function () {
    if (window.matchMedia('(min-width: 768px)').matches && sidenav.classList.contains('is-open')) {
      closeNav();
    }
  });
})();
