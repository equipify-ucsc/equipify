/* ==========================================================================
   Equipify — Customer Wishlist
   Mobile navigation drawer, remove-from-wishlist, and move-to-rental-request
   interactions (vanilla JS, no dependencies)
   ========================================================================== */

(function () {
  'use strict';

  /* ---- Mobile navigation drawer (shared shell behavior) ---- */
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

  /* ---- Wishlist grid interactions ---- */
  var grid = document.getElementById('wishlist-grid');
  var emptyState = document.getElementById('wishlist-empty');
  var countLabel = document.getElementById('wishlist-count');
  var announcer = document.getElementById('wishlist-announcer');

  if (!grid || !emptyState || !countLabel) return;

  function announce(message) {
    if (announcer) {
      announcer.textContent = message;
    }
  }

  function updateCount() {
    var remaining = grid.querySelectorAll('.wishlist-card').length;
    countLabel.textContent = remaining + (remaining === 1 ? ' item saved' : ' items saved');

    if (remaining === 0) {
      grid.hidden = true;
      emptyState.hidden = false;
    }
  }

  grid.addEventListener('click', function (event) {
    var removeBtn = event.target.closest('[data-remove]');
    if (removeBtn) {
      var card = removeBtn.closest('.wishlist-card');
      if (!card) return;

      var titleEl = card.querySelector('.wishlist-card__title');
      var name = titleEl ? titleEl.textContent : 'Item';

      card.classList.add('is-removing');
      card.addEventListener('transitionend', function handleRemoved() {
        card.removeEventListener('transitionend', handleRemoved);
        card.remove();
        updateCount();
      });

      announce(name + ' removed from your wishlist.');
      return;
    }

    var moveBtn = event.target.closest('[data-move-to-request]');
    if (moveBtn && !moveBtn.disabled) {
      var card2 = moveBtn.closest('.wishlist-card');
      var titleEl2 = card2 ? card2.querySelector('.wishlist-card__title') : null;
      var name2 = titleEl2 ? titleEl2.textContent : 'Item';

      moveBtn.disabled = true;
      moveBtn.classList.add('is-done');
      moveBtn.innerHTML = '<span class="icon icon-sm" aria-hidden="true">check_circle</span> Request Started';

      announce('Rental request started for ' + name2 + '.');
    }
  });

  updateCount();
})();
