/* ==========================================================================
   Equipify — Technician Profile
   Real data: GET /profile fills the header, PUT /profile saves the details a
   technician owns (name, phone, NIC, address, specialization, experience,
   bio). Email is the login and the district is set by the area manager, so
   neither is editable here. The photo is changed through shared/profile.js.
   Needs shared/api.js, shared/session.js and shared/profile.js.
   ========================================================================== */

(function () {
  'use strict';

  var editCard = document.getElementById('editCard');
  var editBtn = document.getElementById('editProfileBtn');
  var form = document.getElementById('profileForm');
  var formError = document.getElementById('profileFormError');
  var saveBtn = document.getElementById('saveProfileBtn');

  var photo = EquipifyProfile.initPhotoUploader({
    changeBtn: document.getElementById('changePhotoBtn'),
    removeBtn: document.getElementById('removePhotoBtn')
  });

  // The last profile the server confirmed, so Cancel can restore the form.
  var saved = null;

  function setText(id, value) {
    document.getElementById(id).textContent = value || '–';
  }

  function fill(profile) {
    saved = profile;
    setText('profileLocation', profile.district ? profile.district + ', Sri Lanka' : '');
    setText('profileYears', profile.years_experience === null
      ? '' : profile.years_experience + (profile.years_experience === 1 ? ' Year' : ' Years'));
    setText('profileEmail', profile.email);
    setText('profilePhone', profile.phone);
    setText('profileSpecialization', profile.specialization);
    document.getElementById('profileBio').textContent =
      profile.bio || 'No bio yet. Use Edit Profile to tell customers about your experience.';

    form.elements.full_name.value = profile.full_name || '';
    document.getElementById('emailInput').value = profile.email || '';
    form.elements.phone.value = profile.phone || '';
    form.elements.nic_number.value = profile.nic_number || '';
    form.elements.specialization.value = profile.specialization || '';
    form.elements.years_experience.value = profile.years_experience === null ? '' : profile.years_experience;
    form.elements.address_line.value = profile.address_line || '';
    form.elements.bio.value = profile.bio || '';

    photo.setHasPhoto(!!profile.photo_url);
  }

  function setEditing(on) {
    editCard.hidden = !on;
    editBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    formError.hidden = true;
    if (on) {
      editCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.elements.full_name.focus({ preventScroll: true });
    } else if (saved) {
      fill(saved);
    }
  }

  EquipifyApi.get('/profile').then(function (res) {
    if (!res.ok) {
      document.getElementById('profileBio').textContent = res.error;
      return;
    }
    fill(res.data);
  });

  editBtn.addEventListener('click', function () {
    setEditing(editCard.hidden);
  });
  document.getElementById('cancelEditBtn').addEventListener('click', function () {
    setEditing(false);
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
      phone: form.elements.phone.value,
      nic_number: form.elements.nic_number.value,
      address_line: form.elements.address_line.value,
      specialization: form.elements.specialization.value,
      // Optional field: send null rather than '' when left blank.
      years_experience: form.elements.years_experience.value || null,
      bio: form.elements.bio.value
    }).then(function (res) {
      saveBtn.disabled = false;
      if (!res.ok) {
        EquipifyProfile.showFormError(formError, res);
        return;
      }
      fill(res.data);
      setEditing(false);
      EquipifySession.refresh();
      EquipifyProfile.toast('Profile updated successfully.');
    });
  });
})();
