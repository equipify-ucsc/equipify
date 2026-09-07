/* ==========================================================================
   Equipify — Renting Party Business Profile
   Mobile navigation drawer (shared shell behavior) + edit-mode toggle and
   save feedback. Vanilla JS, no dependencies.
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

  /* ---------------- Edit mode + save feedback ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var editBtn = document.getElementById('editProfileBtn');
    var saveBtn = document.getElementById('saveProfileBtn');
    var fields = document.querySelectorAll('.form-card input:not([readonly]), .form-card select, .form-card textarea, .company-desc-card textarea');

    var isEditing = false;

    function setEditing(editing) {
      isEditing = editing;
      fields.forEach(function (field) {
        field.disabled = !editing;
      });
      if (editBtn) {
        editBtn.innerHTML = editing
          ? '<span class="icon icon-sm" aria-hidden="true">close</span> Cancel'
          : '<span class="icon icon-sm" aria-hidden="true">edit</span> Edit Profile';
      }
    }

    setEditing(false);

    if (editBtn) {
      editBtn.addEventListener('click', function () {
        setEditing(!isEditing);
      });
    }

    if (saveBtn) {
      var originalLabel = saveBtn.innerHTML;
      saveBtn.addEventListener('click', function () {
        saveBtn.innerHTML = '<span class="icon icon-sm" aria-hidden="true">sync</span> Saving…';
        saveBtn.disabled = true;

        setTimeout(function () {
          saveBtn.innerHTML = '<span class="icon icon-sm" aria-hidden="true">check</span> Saved!';
          setEditing(false);

          setTimeout(function () {
            saveBtn.innerHTML = originalLabel;
            saveBtn.disabled = false;
          }, 1500);
        }, 600);
      });
    }
  });
})();
