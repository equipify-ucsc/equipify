/* ==========================================================================
   Equipify — Renting Party Equipment Details
   Gallery thumbnail switching and save/cancel feedback. Vanilla JS, no
   dependencies. Mobile navigation drawer behavior now lives in
   ../../shared/script.js.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------- Gallery + save/cancel ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var mainImg = document.getElementById('mainGalleryImg');
    var thumbnails = document.querySelectorAll('.thumb-item[data-image]');

    thumbnails.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        if (mainImg) mainImg.src = thumb.getAttribute('data-image');
        thumbnails.forEach(function (t) { t.classList.remove('active'); });
        thumb.classList.add('active');
      });
    });

    var saveBtn = document.getElementById('saveBtn');
    var cancelBtn = document.getElementById('cancelBtn');

    if (saveBtn) {
      var originalLabel = saveBtn.innerHTML;
      saveBtn.addEventListener('click', function () {
        saveBtn.innerHTML = '<span class="icon icon-sm" aria-hidden="true">sync</span> Saving…';
        saveBtn.disabled = true;

        setTimeout(function () {
          saveBtn.innerHTML = '<span class="icon icon-sm" aria-hidden="true">check</span> Saved!';

          setTimeout(function () {
            saveBtn.innerHTML = originalLabel;
            saveBtn.disabled = false;
          }, 1500);
        }, 700);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (confirm('Discard unsaved changes to this listing?')) {
          location.reload();
        }
      });
    }
  });
})();
