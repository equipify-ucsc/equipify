/* ==========================================================================
   Equipify — Renting Party Business Profile
   Edit-mode toggle and save feedback. Vanilla JS, no dependencies. Mobile
   navigation drawer behavior now lives in ../../shared/script.js.
   ========================================================================== */

(function () {
  'use strict';

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
