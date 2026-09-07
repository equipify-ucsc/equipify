/* ==========================================================================
   Equipify — Complaints & Users
   Mobile navigation drawer + table search/filter + modal + user/complaint
   actions (vanilla JS, no dependencies)
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

  // ---------- Table search filter ----------
  document.querySelectorAll('[data-filter-table]').forEach(function (input) {
    input.addEventListener('input', function () {
      var target = document.getElementById(input.dataset.filterTable);
      if (!target) return;
      var query = input.value.toLowerCase();
      target.querySelectorAll('tbody tr').forEach(function (row) {
        row.hidden = !row.textContent.toLowerCase().includes(query);
      });
    });
  });

  // ---------- Table status filter ----------
  document.querySelectorAll('[data-status-filter]').forEach(function (select) {
    select.addEventListener('change', function () {
      var target = document.getElementById(select.dataset.statusFilter);
      if (!target) return;
      var query = select.value.toLowerCase();
      target.querySelectorAll('tbody tr').forEach(function (row) {
        var status = (row.dataset.status || row.textContent).toLowerCase();
        row.hidden = Boolean(query) && !status.includes(query);
      });
    });
  });

  // ---------- Modal open/close ----------
  document.querySelectorAll('[data-modal-open]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var modal = document.getElementById(btn.dataset.modalOpen);
      if (modal) modal.classList.add('is-open');
    });
  });
  document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var modal = btn.closest('.modal-backdrop');
      if (modal) modal.classList.remove('is-open');
    });
  });
  document.querySelectorAll('.modal-backdrop').forEach(function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) modal.classList.remove('is-open');
    });
  });

  // ---------- Modal actions (complaint review) ----------
  document.querySelectorAll('[data-modal-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.dataset.modalAction;
      var modal = btn.closest('.modal-backdrop');
      if (action === 'under-review') {
        window.showToast('Complaint marked under review.');
      } else if (action === 'resolve') {
        window.showToast('Complaint resolved.');
      }
      if (modal) modal.classList.remove('is-open');
    });
  });

  // ---------- Row actions: suspend / ban / approve / reject ----------
  document.querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.dataset.action;

      if (action === 'suspend' || action === 'ban') {
        if (confirm('Are you sure you want to ' + action + ' this user?')) {
          var row = btn.closest('tr');
          var badge = row && row.querySelector('.badge-status');
          if (badge) {
            badge.textContent = action === 'ban' ? 'Banned' : 'Suspended';
            badge.className = 'badge-status badge-status--rejected';
          }
          window.showToast('User ' + action + 'ed successfully.');
        }
      } else if (action === 'approve' || action === 'reject') {
        var actionRow = btn.closest('tr');
        var actionBadge = actionRow && actionRow.querySelector('.badge-status');
        if (actionBadge) {
          actionBadge.textContent = action === 'approve' ? 'Verified' : 'Rejected';
          actionBadge.className = 'badge-status ' + (action === 'approve' ? 'badge-status--active' : 'badge-status--rejected');
        }
        window.showToast(action === 'approve' ? 'Document verified successfully.' : 'Document rejected.');
      }
    });
  });

  // ---------- Generic "View" style buttons ----------
  document.querySelectorAll('[data-toast]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.showToast(btn.dataset.toast);
    });
  });
})();
