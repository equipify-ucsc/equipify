/* ==========================================================================
   Equipify — Renting Party Business Profile
   Real data: GET /profile fills the business and owner details, and Save
   sends PUT /profile with the columns a party owns (business name, owner
   name, phone, business address, operating district, description). The
   registration number and verification are an admin's, and email is the
   login, so those stay read-only. Website, operating hours, VAT, documents
   and the performance panel are still sample content: they can be typed in
   edit mode but aren't stored yet. The photo is changed through
   shared/profile.js. Needs shared/api.js, shared/session.js, shared/profile.js.
   ========================================================================== */

(function () {
  'use strict';

  var VERIFICATION = {
    verified: { label: 'Verified Partner', badge: 'badge-status--active' },
    pending: { label: 'Verification Pending', badge: 'badge-status--pending' },
    rejected: { label: 'Verification Rejected', badge: 'badge-status--rejected' }
  };

  var editBtn = document.getElementById('editProfileBtn');
  var saveBtn = document.getElementById('saveProfileBtn');
  var formError = document.getElementById('profileFormError');
  var fields = document.querySelectorAll('.form-card input:not([readonly]), .form-card select, .form-card textarea, .company-desc-card textarea');

  var inputs = {
    businessName: document.getElementById('businessName'),
    ownerName: document.getElementById('ownerName'),
    regNumber: document.getElementById('regNumber'),
    email: document.getElementById('primaryEmail'),
    phone: document.getElementById('phoneNumber'),
    address: document.getElementById('businessAddress'),
    district: document.getElementById('operatingDistrict'),
    description: document.getElementById('businessDescription')
  };

  var photo = EquipifyProfile.initPhotoUploader({
    changeBtn: document.getElementById('changePhotoBtn'),
    removeBtn: document.getElementById('removePhotoBtn')
  });

  // The last profile the server confirmed, so Cancel can restore the form.
  var saved = null;
  var isEditing = false;

  function fill(profile) {
    saved = profile;
    inputs.businessName.value = profile.business_name || '';
    inputs.ownerName.value = profile.full_name || '';
    inputs.regNumber.value = profile.business_reg_no || '';
    inputs.email.value = profile.email || '';
    inputs.phone.value = profile.phone || '';
    inputs.address.value = profile.business_address || '';
    EquipifyProfile.fillDistricts(inputs.district, profile.district);
    inputs.description.value = profile.description || '';

    var status = VERIFICATION[profile.verification_status] || VERIFICATION.pending;
    var badge = document.getElementById('verificationBadge');
    badge.classList.remove('badge-status--active', 'badge-status--pending', 'badge-status--rejected');
    badge.classList.add(status.badge);
    document.getElementById('verificationLabel').textContent = status.label;

    photo.setHasPhoto(!!profile.photo_url);
  }

  function setEditing(editing) {
    isEditing = editing;
    fields.forEach(function (field) {
      field.disabled = !editing;
    });
    saveBtn.disabled = !editing;
    editBtn.innerHTML = editing
      ? '<span class="icon icon-sm" aria-hidden="true">close</span> Cancel'
      : '<span class="icon icon-sm" aria-hidden="true">edit</span> Edit Profile';
    formError.hidden = true;
    // Cancelling throws away unsaved typing.
    if (!editing && saved) fill(saved);
  }

  setEditing(false);

  EquipifyApi.get('/profile').then(function (res) {
    if (!res.ok) {
      EquipifyProfile.showFormError(formError, res);
      return;
    }
    fill(res.data);
  });

  editBtn.addEventListener('click', function () {
    setEditing(!isEditing);
  });

  document.getElementById('editAddressBtn').addEventListener('click', function () {
    if (!isEditing) setEditing(true);
    inputs.address.focus();
  });

  saveBtn.addEventListener('click', function () {
    formError.hidden = true;
    var required = [inputs.businessName, inputs.ownerName, inputs.phone, inputs.address];
    for (var i = 0; i < required.length; i++) {
      if (!required[i].checkValidity()) {
        required[i].reportValidity();
        return;
      }
    }

    var originalLabel = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="icon icon-sm" aria-hidden="true">sync</span> Saving…';
    saveBtn.disabled = true;

    EquipifyApi.put('/profile', {
      business_name: inputs.businessName.value,
      full_name: inputs.ownerName.value,
      phone: inputs.phone.value,
      business_address: inputs.address.value,
      district: inputs.district.value,
      description: inputs.description.value
    }).then(function (res) {
      saveBtn.innerHTML = originalLabel;
      if (!res.ok) {
        saveBtn.disabled = false;
        EquipifyProfile.showFormError(formError, res);
        return;
      }
      fill(res.data);
      setEditing(false);
      EquipifySession.refresh();
      EquipifyProfile.toast('Business profile saved.');
    });
  });
})();
