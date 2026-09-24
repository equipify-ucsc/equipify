/* ==========================================================================
   Equipify — Renting Party Equipment Details (add + edit a listing)
   ?id=<equipment_id> edits that listing; no id adds a new one.

   Category -> equipment type come from the catalogue, and the chosen type
   decides which spec inputs appear (shared/catalogue.js builds them). "Other"
   types get a free-text specifications box instead. Photos are uploaded one
   per request: straight away when editing, or queued and sent right after
   the new listing is created. Vanilla JS, no dependencies; the mobile
   navigation drawer lives in ../../shared/script.js.
   ========================================================================== */

(function () {
  'use strict';

  var STATUS_BADGE = { available: 'active', on_rent: 'completed', maintenance: 'pending', retired: 'draft' };
  var STATUS_LABEL = { available: 'Available', on_rent: 'On Rent', maintenance: 'Maintenance', retired: 'Removed' };
  var MAX_PHOTOS = 8;
  var MAX_PHOTO_BYTES = 3 * 1024 * 1024;

  var form = document.getElementById('equipmentForm');
  if (!form) return;

  var params = new URLSearchParams(window.location.search);
  var state = {
    id: /^\d+$/.test(params.get('id') || '') ? params.get('id') : null,
    categories: [],
    listing: null,
    specs: null,        // renderSpecInputs() handle for the current type
    isOther: false,
    photos: [],         // saved photos: {photo_id, url, is_cover}
    pending: [],        // queued before the listing exists: {name, data, preview}
    selectedPhoto: 0
  };

  var el = function (tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  var icon = function (name) {
    var span = el('span', 'icon', name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  };

  var categorySelect = document.getElementById('eqCategory');
  var typeSelect = document.getElementById('eqType');
  var specFields = document.getElementById('specFields');
  var specHint = document.getElementById('specHint');
  var extraSpecsGroup = document.getElementById('extraSpecsGroup');
  var formAlert = document.getElementById('formAlert');
  var saveBtn = document.getElementById('saveBtn');

  // ---------- Toast ----------
  var toastTimer;
  function showToast(message) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 3000);
  }

  // ---------- Errors ----------
  function clearErrors() {
    formAlert.hidden = true;
    form.querySelectorAll('[data-error-for]').forEach(function (p) { p.hidden = true; p.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    if (state.specs) state.specs.showErrors({});
  }

  function showErrors(res) {
    var fields = res.fields || {};
    Object.keys(fields).forEach(function (key) {
      var p = form.querySelector('[data-error-for="' + key + '"]');
      if (!p) return;
      p.textContent = fields[key];
      p.hidden = false;
      var input = form.elements[key];
      if (input && input.setAttribute) input.setAttribute('aria-invalid', 'true');
    });
    if (state.specs) state.specs.showErrors(fields);
    formAlert.textContent = res.error;
    formAlert.hidden = false;
    formAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- Category -> type -> spec fields ----------
  function fillTypes(categoryId, keepTypeId) {
    EquipifyCatalogue.fillTypeSelect(typeSelect, state.categories, categoryId, categoryId ? 'Select a type' : 'Select a category first');
    // A listing may keep a type the admin has since deactivated; show it anyway.
    if (keepTypeId && !typeSelect.querySelector('option[value="' + keepTypeId + '"]') && state.listing) {
      typeSelect.appendChild(new Option(state.listing.type_name + ' (no longer offered)', String(keepTypeId)));
    }
    if (keepTypeId) typeSelect.value = String(keepTypeId);
  }

  function showSpecsFor(typeId, values) {
    state.specs = null;
    specFields.textContent = '';
    extraSpecsGroup.hidden = true;
    if (!typeId) {
      state.isOther = false;
      specHint.textContent = 'Choose an equipment type to see the specifications customers look for.';
      specHint.hidden = false;
      return Promise.resolve();
    }
    specHint.textContent = 'Loading specifications…';
    specHint.hidden = false;
    return EquipifyCatalogue.loadFields(typeId).then(function (data) {
      if (String(typeSelect.value) !== String(typeId)) return; // changed again meanwhile
      if (!data) {
        specHint.textContent = 'Could not load the specifications for this type. Try again.';
        return;
      }
      state.isOther = data.is_other;
      if (data.is_other || !data.fields.length) {
        specHint.textContent = data.is_other
          ? 'This is a catch-all type, so describe the specifications in your own words.'
          : 'This type has no set specifications. Add any details in the description.';
        extraSpecsGroup.hidden = !data.is_other;
        return;
      }
      specHint.textContent = 'Fields marked * are required. Customers can filter by some of these.';
      state.specs = EquipifyCatalogue.renderSpecInputs(specFields, data.fields, values || {}, {
        field: 'form-group',
        label: 'spec-label',
        input: '',
        full: 'full-width',
        error: 'spec-error'
      });
    });
  }

  categorySelect.addEventListener('change', function () {
    fillTypes(categorySelect.value, null);
    showSpecsFor('', null);
  });

  typeSelect.addEventListener('change', function () {
    // Keep what was typed when switching between types that share a field.
    var carried = state.specs ? state.specs.read() : {};
    showSpecsFor(typeSelect.value, carried);
  });

  // ---------- Photos ----------
  var mainImg = document.getElementById('mainGalleryImg');
  var galleryEmpty = document.getElementById('galleryEmpty');
  var thumbnails = document.getElementById('thumbnails');
  var photoInput = document.getElementById('photoInput');
  var photoError = document.getElementById('photoError');

  function allPhotos() {
    return state.photos.map(function (p) {
      return { src: EquipifyApi.url(p.url), saved: p };
    }).concat(state.pending.map(function (p) {
      return { src: p.preview, pending: p };
    }));
  }

  function renderPhotos() {
    var photos = allPhotos();
    thumbnails.textContent = '';
    if (state.selectedPhoto >= photos.length) state.selectedPhoto = 0;

    galleryEmpty.hidden = photos.length > 0;
    mainImg.hidden = photos.length === 0;
    if (photos.length) {
      mainImg.src = photos[state.selectedPhoto].src;
      mainImg.alt = 'Photo ' + (state.selectedPhoto + 1) + ' of ' + photos.length;
    }

    photos.forEach(function (photo, index) {
      var thumb = el('div', 'thumb-item' + (index === state.selectedPhoto ? ' active' : '') + (photo.pending ? ' is-pending' : ''));
      var img = el('img');
      img.src = photo.src;
      img.alt = '';
      thumb.appendChild(img);
      thumb.tabIndex = 0;
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('aria-label', 'Show photo ' + (index + 1));
      function select() {
        state.selectedPhoto = index;
        renderPhotos();
      }
      thumb.addEventListener('click', select);
      thumb.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });

      var tools = el('div', 'thumb-tools');
      if (photo.saved) {
        var cover = el('button', 'thumb-tool' + (photo.saved.is_cover ? ' is-cover' : ''));
        cover.type = 'button';
        cover.title = photo.saved.is_cover ? 'Cover photo' : 'Make cover photo';
        cover.setAttribute('aria-label', cover.title);
        cover.appendChild(icon('star'));
        cover.addEventListener('click', function (e) {
          e.stopPropagation();
          if (photo.saved.is_cover) return;
          EquipifyApi.post('/renting-party/equipment/' + state.id + '/photos/' + photo.saved.photo_id + '/cover').then(function (res) {
            if (!res.ok) { showToast(res.error); return; }
            state.photos = res.data.photos;
            state.selectedPhoto = 0;
            renderPhotos();
          });
        });
        tools.appendChild(cover);
      } else {
        thumb.appendChild(el('span', 'thumb-tag', 'Not saved'));
      }
      var remove = el('button', 'thumb-tool');
      remove.type = 'button';
      remove.title = 'Remove photo';
      remove.setAttribute('aria-label', 'Remove photo ' + (index + 1));
      remove.appendChild(icon('close'));
      remove.addEventListener('click', function (e) {
        e.stopPropagation();
        if (photo.pending) {
          state.pending.splice(state.pending.indexOf(photo.pending), 1);
          renderPhotos();
          return;
        }
        if (!window.confirm('Remove this photo?')) return;
        EquipifyApi.del('/renting-party/equipment/' + state.id + '/photos/' + photo.saved.photo_id).then(function (res) {
          if (!res.ok) { showToast(res.error); return; }
          state.photos = res.data.photos;
          renderPhotos();
        });
      });
      tools.appendChild(remove);
      thumb.appendChild(tools);
      thumbnails.appendChild(thumb);
    });
  }

  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function uploadPhoto(photo) {
    return EquipifyApi.post('/renting-party/equipment/' + state.id + '/photos', {
      photo: { name: photo.name, data: photo.data }
    }).then(function (res) {
      if (res.ok) state.photos = res.data.photos;
      return res;
    });
  }

  photoInput.addEventListener('change', function () {
    photoError.hidden = true;
    var files = Array.prototype.slice.call(photoInput.files || []);
    photoInput.value = '';
    var room = MAX_PHOTOS - state.photos.length - state.pending.length;
    if (files.length > room) {
      photoError.textContent = 'A listing can have at most ' + MAX_PHOTOS + ' photos.';
      photoError.hidden = false;
      files = files.slice(0, Math.max(room, 0));
    }
    files = files.filter(function (f) {
      if (f.size > MAX_PHOTO_BYTES) {
        photoError.textContent = '"' + f.name + '" is larger than 3 MB.';
        photoError.hidden = false;
        return false;
      }
      return true;
    });

    // Upload one after another so the photo order matches the selection.
    files.reduce(function (chain, file) {
      return chain.then(function () {
        return readAsBase64(file).then(function (data) {
          var photo = { name: file.name, data: data, preview: URL.createObjectURL(file) };
          if (!state.id) {
            state.pending.push(photo);
            renderPhotos();
            return null;
          }
          return uploadPhoto(photo).then(function (res) {
            if (!res.ok) {
              photoError.textContent = Object.keys(res.fields).map(function (k) { return res.fields[k]; }).join(' ') || res.error;
              photoError.hidden = false;
            }
            renderPhotos();
          });
        });
      });
    }, Promise.resolve());
  });

  // ---------- Load / fill ----------
  function setHeader(listing) {
    var badge = document.getElementById('statusBadge');
    if (!listing) return;
    document.getElementById('pageHeading').textContent = listing.title;
    document.getElementById('pageSubheading').textContent =
      listing.category_name + ' › ' + listing.type_name + ' · Listing #' + listing.equipment_id;
    badge.className = 'badge-status badge-status--' + (STATUS_BADGE[listing.status] || 'draft');
    badge.textContent = STATUS_LABEL[listing.status] || listing.status;
    badge.hidden = false;
    document.title = 'Equipify - ' + listing.title;
    document.getElementById('saveLabel').textContent = 'Save Changes';
  }

  function fill(listing) {
    var f = form.elements;
    f.title.value = listing.title;
    f.brand.value = listing.brand || '';
    f.model.value = listing.model || '';
    f.year_made.value = listing.year_made || '';
    f.serial_no.value = listing.serial_no || '';
    f.condition_grade.value = listing.condition_grade;
    f.quantity.value = listing.quantity;
    f.description.value = listing.description || '';
    f.extra_specs.value = listing.extra_specs || '';
    f.daily_rate_lkr.value = listing.daily_rate_lkr;
    f.deposit_lkr.value = listing.deposit_lkr || '';
    f.district.value = listing.district;
    f.address.value = listing.address;
    if (listing.status !== 'retired') f.status.value = listing.status;

    categorySelect.value = String(listing.category_id);
    fillTypes(listing.category_id, listing.type_id);

    var values = {};
    listing.specs.forEach(function (s) { values[s.field_key] = s.value; });
    showSpecsFor(listing.type_id, values);

    state.photos = listing.photos;
    renderPhotos();
    setHeader(listing);
    document.getElementById('dangerCard').hidden = listing.status === 'retired';

    if (listing.status === 'retired') {
      form.querySelectorAll('input, select, textarea, button').forEach(function (i) { i.disabled = true; });
      saveBtn.disabled = true;
      formAlert.textContent = 'This listing has been removed, so it can no longer be edited.';
      formAlert.hidden = false;
    }
  }

  function start() {
    EquipifyCatalogue.load().then(function (categories) {
      state.categories = categories;
      EquipifyCatalogue.fillCategorySelect(categorySelect, categories, 'Select a category');
      fillRequestCategories();
      if (!state.id) {
        renderPhotos();
        return;
      }
      EquipifyApi.get('/renting-party/equipment/' + state.id).then(function (res) {
        if (!res.ok) {
          formAlert.textContent = res.status === 404 ? 'This listing was not found.' : res.error;
          formAlert.hidden = false;
          saveBtn.disabled = true;
          return;
        }
        state.listing = res.data;
        fill(res.data);
      });
    });
  }

  // ---------- Save ----------
  function body() {
    var f = form.elements;
    return {
      type_id: typeSelect.value,
      title: f.title.value,
      brand: f.brand.value,
      model: f.model.value,
      year_made: f.year_made.value,
      serial_no: f.serial_no.value,
      condition_grade: f.condition_grade.value,
      quantity: f.quantity.value,
      description: f.description.value,
      extra_specs: state.isOther ? f.extra_specs.value : '',
      daily_rate_lkr: f.daily_rate_lkr.value,
      deposit_lkr: f.deposit_lkr.value,
      district: f.district.value,
      address: f.address.value,
      status: f.status.value,
      specs: state.specs ? state.specs.read() : {}
    };
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearErrors();

    var creating = !state.id;
    saveBtn.disabled = true;
    var request = creating
      ? EquipifyApi.post('/renting-party/equipment', body())
      : EquipifyApi.put('/renting-party/equipment/' + state.id, body());

    request.then(function (res) {
      if (!res.ok) {
        saveBtn.disabled = false;
        showErrors(res);
        return null;
      }
      state.listing = res.data;
      state.id = String(res.data.equipment_id);
      setHeader(res.data);
      document.getElementById('dangerCard').hidden = false;
      if (creating) {
        window.history.replaceState(null, '', '?id=' + state.id);
      }

      // Now that the listing exists, send the queued photos one by one.
      var queued = state.pending.splice(0);
      return queued.reduce(function (chain, photo) {
        return chain.then(function (failed) {
          return uploadPhoto(photo).then(function (r) { return r.ok ? failed : failed + 1; });
        });
      }, Promise.resolve(0)).then(function (failed) {
        saveBtn.disabled = false;
        renderPhotos();
        showToast(failed
          ? 'Listing saved, but ' + failed + ' photo(s) could not be uploaded.'
          : (creating ? 'Listing created. Customers can now find it.' : 'Changes saved.'));
      });
    });
  });

  // ---------- Remove ----------
  document.getElementById('removeBtn').addEventListener('click', function () {
    if (!state.id || !window.confirm('Remove this listing? Customers will no longer see it.')) return;
    EquipifyApi.del('/renting-party/equipment/' + state.id).then(function (res) {
      if (!res.ok) { showToast(res.error); return; }
      window.location.href = '../My Equipment/index.html';
    });
  });

  // ---------- Request a new equipment type ----------
  var requestModal = document.getElementById('requestModal');
  var requestForm = document.getElementById('requestForm');
  var requestError = document.getElementById('requestError');

  function fillRequestCategories() {
    EquipifyCatalogue.fillCategorySelect(document.getElementById('requestCategory'), state.categories, 'Select a category');
  }

  function loadRequestHistory() {
    EquipifyApi.get('/renting-party/type-requests').then(function (res) {
      var wrap = document.getElementById('requestHistory');
      var list = document.getElementById('requestList');
      if (!res.ok || !res.data.length) { wrap.hidden = true; return; }
      list.textContent = '';
      res.data.slice(0, 5).forEach(function (r) {
        var li = el('li');
        li.appendChild(el('span', null, r.proposed_name + ' (' + r.category_name + ')'));
        var map = { pending: 'pending', approved: 'active', rejected: 'rejected' };
        li.appendChild(el('span', 'badge-status badge-status--' + map[r.status], r.status_label));
        if (r.admin_note) li.appendChild(el('span', 'request-note', r.admin_note));
        list.appendChild(li);
      });
      wrap.hidden = false;
    });
  }

  document.getElementById('requestTypeBtn').addEventListener('click', function () {
    requestForm.reset();
    requestError.hidden = true;
    if (categorySelect.value) requestForm.elements.category_id.value = categorySelect.value;
    requestModal.classList.add('is-open');
    requestForm.elements.proposed_name.focus();
    loadRequestHistory();
  });
  requestModal.querySelectorAll('[data-modal-close]').forEach(function (b) {
    b.addEventListener('click', function () { requestModal.classList.remove('is-open'); });
  });
  requestModal.addEventListener('click', function (e) {
    if (e.target === requestModal) requestModal.classList.remove('is-open');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') requestModal.classList.remove('is-open');
  });

  requestForm.addEventListener('submit', function (event) {
    event.preventDefault();
    requestError.hidden = true;
    if (!requestForm.checkValidity()) { requestForm.reportValidity(); return; }
    EquipifyApi.post('/renting-party/type-requests', {
      category_id: requestForm.elements.category_id.value,
      proposed_name: requestForm.elements.proposed_name.value,
      reason: requestForm.elements.reason.value
    }).then(function (res) {
      if (!res.ok) {
        requestError.textContent = Object.keys(res.fields).map(function (k) { return res.fields[k]; }).join(' ') || res.error;
        requestError.hidden = false;
        return;
      }
      requestModal.classList.remove('is-open');
      showToast('Request sent. Meanwhile you can list it under "Other".');
    });
  });

  start();
})();
