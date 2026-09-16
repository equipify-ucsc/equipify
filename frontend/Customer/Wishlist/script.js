/* ==========================================================================
   Equipify — Customer Wishlist
   Remove-from-wishlist and move-to-rental-request interactions
   (vanilla JS, no dependencies)
   ========================================================================== */

(function () {
  'use strict';

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
