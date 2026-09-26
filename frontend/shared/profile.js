/* ==========================================================================
   Equipify — shared profile-page helpers (vanilla JS)
   Needs shared/api.js and shared/session.js first. Exposes window.EquipifyProfile:

     DISTRICTS                         the list the backend validates against
     fillDistricts(select, selected)   fills a <select> with DISTRICTS
     showFormError(el, res)            an API failure in a form's error line
     toast(message)                    a short confirmation in #toast
     readFileAsBase64(file)            File -> {name, data} for core/Upload.php
     initPhotoUploader(options)        change/remove the profile photo

   The photo is stored by POST /profile/photo in backend/storage/profile-photos
   and shown by session.js in every [data-user-avatar] box, so after an upload
   or removal this only has to ask the session to re-render.
   ========================================================================== */

(function () {
  'use strict';

  var DISTRICTS = [
    'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
    'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
    'Mannar', 'Matale', 'Matara', 'Moneragala', 'Mullaitivu', 'Nuwara Eliya',
    'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya'
  ];

  var MAX_PHOTO_BYTES = 2 * 1024 * 1024;
  var PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  /** Fills a <select> with every district; keeps an unknown stored value selectable. */
  function fillDistricts(select, selected) {
    if (!select) return;
    select.textContent = '';
    var list = DISTRICTS.slice();
    if (selected && list.indexOf(selected) === -1) list.unshift(selected);
    list.forEach(function (district) {
      var option = document.createElement('option');
      option.value = district;
      option.textContent = district;
      select.appendChild(option);
    });
    if (selected) select.value = selected;
  }

  /**
   * Shows the per-field messages the API returns ({fields: {phone: '…'}}) in a
   * form's single error line, falling back to the general message.
   */
  function showFormError(errorEl, res) {
    if (!errorEl) return;
    var details = Object.keys(res.fields || {}).map(function (key) { return res.fields[key]; });
    errorEl.textContent = details.length ? details.join(' ') : res.error;
    errorEl.hidden = false;
  }

  var toastTimer;
  function toast(message) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-visible'); }, 2600);
  }

  /** @returns {Promise<{name:string,data:string}>} */
  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // "data:image/png;base64,iVBOR..." -> "iVBOR..."
        var result = String(reader.result);
        resolve({ name: file.name, data: result.slice(result.indexOf(',') + 1) });
      };
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Wires a "Change photo" button (and optionally "Remove") to the photo API.
   *
   * @param {{changeBtn:Element, removeBtn?:Element, errorEl?:Element}} options
   * @returns {{setHasPhoto:function(boolean)}} call after loading the profile
   */
  function initPhotoUploader(options) {
    var changeBtn = options.changeBtn;
    var removeBtn = options.removeBtn || null;
    var errorEl = options.errorEl || null;
    if (!changeBtn) return { setHasPhoto: function () {} };

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = PHOTO_TYPES.join(',');
    input.hidden = true;
    changeBtn.insertAdjacentElement('afterend', input);

    function setHasPhoto(has) {
      if (removeBtn) removeBtn.hidden = !has;
    }

    function fail(message) {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      } else {
        toast(message);
      }
    }

    function busy(on) {
      changeBtn.disabled = on;
      if (removeBtn) removeBtn.disabled = on;
    }

    changeBtn.addEventListener('click', function () {
      if (errorEl) errorEl.hidden = true;
      input.click();
    });

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      // Checked here for a quick answer; the server checks size and real type again.
      if (PHOTO_TYPES.indexOf(file.type) === -1) {
        fail('Choose a JPG, PNG or WEBP image.');
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        fail('That photo is over 2 MB. Try a smaller one.');
        return;
      }

      busy(true);
      readFileAsBase64(file).then(function (photo) {
        return EquipifyApi.post('/profile/photo', { photo: photo });
      }).then(function (res) {
        busy(false);
        if (!res.ok) {
          fail(res.error);
          return;
        }
        setHasPhoto(true);
        EquipifySession.renderAvatars(res.data.photo_url);
        toast('Profile photo updated.');
      }).catch(function () {
        busy(false);
        fail('Could not read that file.');
      });
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        if (errorEl) errorEl.hidden = true;
        busy(true);
        EquipifyApi.del('/profile/photo').then(function (res) {
          busy(false);
          if (!res.ok) {
            fail(res.error);
            return;
          }
          setHasPhoto(false);
          EquipifySession.renderAvatars(null);
          toast('Profile photo removed.');
        });
      });
    }

    return { setHasPhoto: setHasPhoto };
  }

  window.EquipifyProfile = {
    DISTRICTS: DISTRICTS,
    fillDistricts: fillDistricts,
    showFormError: showFormError,
    toast: toast,
    readFileAsBase64: readFileAsBase64,
    initPhotoUploader: initPhotoUploader
  };
})();
