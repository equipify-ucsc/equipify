/* ==========================================================================
   Equipify — Customer Profile
   Page-specific behavior (vanilla JS, no dependencies)
   ========================================================================== */

(function () {
  'use strict';

  // Review tabs: simple active-state toggle (no content switching wired up,
  // since this is UI-only per project scope)
  var reviewTabs = document.querySelectorAll('.review-tab');
  reviewTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      reviewTabs.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
    });
  });
})();
