/* ==========================================================================
   Equipify — Customer Profile
   Page-specific behavior (vanilla JS, needs shared/api.js, shared/session.js
   and shared/profile.js)
   ========================================================================== */

(function () {
  'use strict';

  // Review tabs: simple active-state toggle (no content switching wired up,
  // since this is UI-only per project scope)
  var reviewTabs = document.querySelectorAll('.review-tab');
  reviewTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      reviewTabs.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
    });
  });

  // ---------- Profile header + edit form (GET/PUT /profile) ----------
  // Only the personal details are real: company, contact name, email,
  // address, phone and photo. The stats, active rentals and reviews are still
  // sample content until those features have tables. The contact name and
  // photo are drawn by session.js ([data-user-name], [data-user-avatar]).
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
    var node = document.getElementById(id);
    if (node) node.textContent = value || '–';
  }

  function fillProfile(p) {
    saved = p;
    var address = [p.address_line, p.district].filter(function (part) { return part; }).join(', ');
    setText('profileCompany', p.company_name || p.full_name);
    setText('profileEmail', p.email);
    setText('profilePhone', p.phone);
    setText('profileAddress', address);

    form.elements.full_name.value = p.full_name || '';
    form.elements.company_name.value = p.company_name || '';
    document.getElementById('emailInput').value = p.email || '';
    form.elements.phone.value = p.phone || '';
    form.elements.address_line.value = p.address_line || '';
    EquipifyProfile.fillDistricts(form.elements.district, p.district);

    photo.setHasPhoto(!!p.photo_url);
  }

  function setEditing(on) {
    editCard.hidden = !on;
    editBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    formError.hidden = true;
    if (on) {
      editCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.elements.full_name.focus({ preventScroll: true });
    } else if (saved) {
      fillProfile(saved);
    }
  }

  EquipifyApi.get('/profile').then(function (res) {
    if (!res.ok) {
      setText('profileCompany', 'Profile unavailable');
      return;
    }
    fillProfile(res.data);
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
      company_name: form.elements.company_name.value,
      phone: form.elements.phone.value,
      address_line: form.elements.address_line.value,
      district: form.elements.district.value
    }).then(function (res) {
      saveBtn.disabled = false;
      if (!res.ok) {
        EquipifyProfile.showFormError(formError, res);
        return;
      }
      fillProfile(res.data);
      setEditing(false);
      EquipifySession.refresh();
      EquipifyProfile.toast('Profile updated successfully.');
    });
  });

  // ---------- Open jobs (GET /customer/jobs) ----------
  // The section shows the newest few open jobs; the full list, and every
  // action on a job, lives on the Job History page.
  var OPEN_JOBS_SHOWN = 3;
  var openJobsGrid = document.getElementById('openJobsGrid');
  var openJobCounts = document.querySelectorAll('[data-open-job-count]');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function metaRow(iconName, text) {
    var row = el('div', 'entity-meta-row');
    var glyph = el('span', 'icon icon-sm', iconName);
    glyph.setAttribute('aria-hidden', 'true');
    row.appendChild(glyph);
    row.appendChild(el('span', 'type-body-sm', text));
    return row;
  }

  function formatDate(value) {
    var parsed = new Date(String(value).replace(' ', 'T'));
    if (isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  function openJobCard(job) {
    var card = el('div', 'card card--hover entity-card');

    var head = el('div', 'entity-card-head');
    var main = el('div', 'entity-card-main');
    main.appendChild(el('h3', 'type-headline-sm entity-title', job.title));
    head.appendChild(main);
    var badge = el('span', 'badge-status badge-status--pending');
    var dot = el('span', 'badge-status__dot');
    dot.setAttribute('aria-hidden', 'true');
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(' Open'));
    head.appendChild(badge);
    card.appendChild(head);

    card.appendChild(metaRow('calendar_today', 'Posted ' + formatDate(job.published_at)));
    card.appendChild(metaRow('groups', job.bid_count === 1 ? '1 bid' : job.bid_count + ' bids'));

    var footer = el('div', 'entity-footer');
    var link = el('a', 'btn-outline', 'View in Job History');
    link.href = '../Job History/index.html';
    footer.appendChild(link);
    card.appendChild(footer);
    return card;
  }

  if (openJobsGrid) {
    EquipifyApi.get('/customer/jobs').then(function (res) {
      openJobsGrid.textContent = '';
      if (!res.ok) {
        openJobsGrid.appendChild(el('p', 'open-jobs-state', res.error));
        return;
      }

      var open = res.data.filter(function (job) { return job.status === 'open'; });
      openJobCounts.forEach(function (node) { node.textContent = open.length; });

      if (open.length === 0) {
        openJobsGrid.appendChild(el('p', 'open-jobs-state', 'No open jobs right now. Post one from Job History.'));
        return;
      }
      open.slice(0, OPEN_JOBS_SHOWN).forEach(function (job) {
        openJobsGrid.appendChild(openJobCard(job));
      });
    });
  }
})();
