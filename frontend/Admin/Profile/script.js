/* ==========================================================================
   Equipify — Admin Profile
   Real data: GET /profile fills the account details, PUT /profile saves the
   name and phone (the only columns an admin edits about themselves; email is
   the login and stays read-only). The photo is changed through
   shared/profile.js. Role, access and profile summary are display-only.
   Needs shared/api.js, shared/session.js and shared/profile.js.
   ========================================================================== */

(function () {
  'use strict';

  var form = document.getElementById('profileForm');
  var formError = document.getElementById('profileFormError');
  var saveBtn = document.getElementById('saveProfileBtn');

  var photo = EquipifyProfile.initPhotoUploader({
    changeBtn: document.getElementById('changePhotoBtn'),
    removeBtn: document.getElementById('removePhotoBtn')
  });

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value || '–';
  }

  function formatDateTime(value) {
    if (!value) return 'Never';
    var parsed = new Date(String(value).replace(' ', 'T'));
    if (isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function fill(profile) {
    form.elements.full_name.value = profile.full_name || '';
    form.elements.phone.value = profile.phone || '';
    document.getElementById('profileEmail').value = profile.email || '';
    setText('sideEmail', profile.email);
    setText('sideLastLogin', formatDateTime(profile.last_login_at));
    setText('sideStatus', profile.account_status === 'active' ? 'Active' : profile.account_status);
    photo.setHasPhoto(!!profile.photo_url);
  }

  EquipifyApi.get('/profile').then(function (res) {
    if (!res.ok) {
      EquipifyProfile.showFormError(formError, res);
      return;
    }
    fill(res.data);
  });

  saveBtn.addEventListener('click', function () {
    form.requestSubmit();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    formError.hidden = true;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    saveBtn.disabled = true;
    EquipifyApi.put('/profile', {
      full_name: form.elements.full_name.value,
      phone: form.elements.phone.value
    }).then(function (res) {
      saveBtn.disabled = false;
      if (!res.ok) {
        EquipifyProfile.showFormError(formError, res);
        return;
      }
      fill(res.data);
      EquipifySession.refresh();
      EquipifyProfile.toast('Admin profile updated successfully.');
    });
  });
})();
