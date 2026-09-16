/* ==========================================================================
   Equipify — Area Manager Profile
   Mobile navigation drawer behavior + profile form save (vanilla JS, no
   dependencies)
   ========================================================================== */

(function () {
  'use strict';

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

  // ---------- Stub links (sections not built yet) ----------
  document.querySelectorAll('.is-stub').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var label = link.getAttribute('data-stub-label') || 'This section';
      window.showToast(label + ' is coming soon.');
    });
  });

  // ---------- Profile form ----------
  var profileForm = document.getElementById('profileForm');
  var saveProfileBtn = document.getElementById('saveProfileBtn');

  if (saveProfileBtn && profileForm) {
    saveProfileBtn.addEventListener('click', function () {
      profileForm.requestSubmit();
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (profileForm.checkValidity()) {
        window.showToast('Area manager profile updated successfully.');
      } else {
        profileForm.reportValidity();
      }
    });
  }
})();
