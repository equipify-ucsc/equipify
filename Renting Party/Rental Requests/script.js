/* ==========================================================================
   Equipify — Renting Party Rental Requests
   Mobile navigation drawer (shared shell behavior) + table filter, tabs,
   and pagination interactions. Vanilla JS, no dependencies.
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
