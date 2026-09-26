/* ==========================================================================
   Equipify — Area Manager / Notifications

   Everything this page does is shared by every role's Notifications page, so it
   lives in ../../shared/notifications.js; the role's own data and who it may
   message come from ../../shared/inbox-mock.js (UI only, mock data).
   ========================================================================== */

(function () {
  'use strict';
  EquipifyNotifications.init();

  // ---------- Stub links (sections not built yet), as on every Area Manager page ----------
  var toast = document.getElementById('toast');
  var toastTimer;
  document.querySelectorAll('.is-stub').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      toast.textContent = (link.getAttribute('data-stub-label') || 'This section') + ' is coming soon.';
      toast.classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 2600);
    });
  });
})();
