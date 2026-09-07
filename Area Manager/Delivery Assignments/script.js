/* ==========================================================================
   Equipify — Delivery Assignments (Area Manager)
   Mobile navigation drawer, status filter, and personnel+vehicle
   assignment forms (vanilla JS, no dependencies)
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

  // ---------- Refresh button ----------
  var refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      window.showToast('Delivery assignments refreshed.');
    });
  }

  // ---------- Stub links (sections not built yet) ----------
  document.querySelectorAll('.is-stub').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var label = link.getAttribute('data-stub-label') || 'This section';
      window.showToast(label + ' is coming soon.');
    });
  });

  // ---------- Status filter tabs ----------
  var filterTabs = document.querySelectorAll('.filter-tab');
  var assignmentCards = document.querySelectorAll('.assignment-card');
  filterTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      filterTabs.forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      var status = tab.getAttribute('data-filter');
      assignmentCards.forEach(function (card) {
        card.hidden = status !== 'all' && card.getAttribute('data-status') !== status;
      });
    });
  });

  // ---------- Personnel + vehicle assignment forms ----------
  document.querySelectorAll('.assignment-form').forEach(function (form) {
    var personnelSelect = form.querySelector('.js-personnel-select');
    var vehicleSelect = form.querySelector('.js-vehicle-select');
    var submitBtn = form.querySelector('button[type="submit"]');

    function updateSubmitState() {
      submitBtn.disabled = !(personnelSelect.value && vehicleSelect.value);
    }
    personnelSelect.addEventListener('change', updateSubmitState);
    vehicleSelect.addEventListener('change', updateSubmitState);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var card = form.closest('.assignment-card');
      var summary = card.querySelector('.assignment-summary');
      var badge = card.querySelector('.badge-status');
      var personnelName = personnelSelect.value;
      var vehicleName = vehicleSelect.value;

      summary.querySelector('.assigned-personnel').textContent = personnelName;
      summary.querySelector('.assigned-vehicle').textContent = vehicleName;

      form.hidden = true;
      summary.hidden = false;

      card.setAttribute('data-status', 'assigned');
      badge.textContent = 'Assigned';
      badge.classList.remove('badge-status--pending');
      badge.classList.add('badge-status--active');

      window.showToast('Delivery assigned to ' + personnelName + '.');
    });
  });

  // ---------- Reassign buttons ----------
  document.querySelectorAll('.assignment-reassign-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.assignment-card');
      card.querySelector('.assignment-summary').hidden = true;
      card.querySelector('.assignment-form').hidden = false;
    });
  });
})();
