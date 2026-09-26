/* ==========================================================================
   Equipify — Area Manager Profile
   Real data: GET /profile fills the account details, PUT /profile saves the
   name and phone. Email is the login and the district is assigned by an
   admin, so both are shown read-only. The photo is changed through
   shared/profile.js. Role and profile summary are display-only.
   Needs shared/api.js, shared/session.js and shared/profile.js.
   ========================================================================== */

(function () {
  'use strict';

  window.showToast = EquipifyProfile.toast;

  // ---------- Stub links (sections not built yet) ----------
  document.querySelectorAll('.is-stub').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var label = link.getAttribute('data-stub-label') || 'This section';
      window.showToast(label + ' is coming soon.');
    });
  });

  // ---------- Profile ----------
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
    EquipifyProfile.fillDistricts(document.getElementById('profileRegion'), profile.district);
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
      window.showToast('Area manager profile updated successfully.');
    });
  });
})();
