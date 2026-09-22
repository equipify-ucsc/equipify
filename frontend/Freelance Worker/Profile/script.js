/* ==========================================================================
   Equipify — Freelance Worker / Profile

   Real data: GET /freelancer/profile fills the form from `users` +
   `freelance_workers`, and PUT /freelancer/profile saves the columns the
   worker owns. verification_status, avg_rating and rating_count are shown but
   never sent: the platform sets those, and the controller ignores them if
   they arrive.

   The portfolio grid below is real too: GET /freelancer/portfolio pages this
   worker's rows in `portfolio_items`, and POST adds one with an optional photo
   sent base64 inside the JSON body. Photos are stored outside the web root and
   streamed back through /freelancer/portfolio/{id}/image, so a stored file is
   never reachable by a guessable URL.
   ========================================================================== */

(function () {
  'use strict';

  // Same list the backend validates against (AuthController::DISTRICTS).
  var DISTRICTS = [
    'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
    'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
    'Mannar', 'Matale', 'Matara', 'Moneragala', 'Mullaitivu', 'Nuwara Eliya',
    'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya'
  ];

  var form = document.getElementById('profileForm');
  var formError = document.getElementById('profileFormError');
  var submitBtn = form.querySelector('button[type="submit"]');
  var banner = document.getElementById('verificationBanner');

  var districtSelect = document.getElementById('district');
  DISTRICTS.forEach(function (district) {
    var option = document.createElement('option');
    option.value = district;
    option.textContent = district;
    districtSelect.appendChild(option);
  });

  // The last profile the server confirmed, so "Discard changes" can restore it
  // without another request.
  var saved = null;

  // ---------- Load ----------
  function load() {
    EquipifyApi.get('/freelancer/profile').then(function (res) {
      if (!res.ok) {
        formError.textContent = res.error;
        formError.hidden = false;
        return;
      }
      saved = res.data;
      fill(saved);
    });
  }
  load();

  function fill(profile) {
    form.elements.full_name.value = profile.full_name;
    document.getElementById('email').value = profile.email;
    form.elements.phone.value = profile.phone;
    form.elements.nic_number.value = profile.nic_number || '';
    form.elements.district.value = profile.district || '';
    form.elements.address_line.value = profile.address_line || '';
    form.elements.availability_status.value = profile.availability_status;
    form.elements.years_experience.value = profile.years_experience === null ? '' : profile.years_experience;
    form.elements.hourly_rate.value = profile.hourly_rate === null ? '' : profile.hourly_rate;
    form.elements.daily_rate.value = profile.daily_rate === null ? '' : profile.daily_rate;
    form.elements.bio.value = profile.bio || '';

    // Read-only tiles.
    var rating = document.getElementById('ratingValue');
    rating.textContent = profile.rating_count === 0 ? 'Not rated' : profile.avg_rating.toFixed(2);
    document.getElementById('ratingCount').textContent = profile.rating_count === 0
      ? 'No ratings yet'
      : 'From ' + profile.rating_count + (profile.rating_count === 1 ? ' customer' : ' customers');

    document.getElementById('verificationValue').textContent =
      Portal.label('verification', profile.verification_status);
    document.getElementById('memberSince').textContent = Portal.date(profile.member_since);
    document.getElementById('accountEmail').textContent = profile.email;

    renderBanner(profile.verification_status);
  }

  var BANNER = {
    pending: {
      modifier: 'banner',
      title: 'Awaiting verification',
      text: 'Upload your NIC, licences and certificates so an admin can verify your account.'
    },
    rejected: {
      modifier: 'banner banner--rejected',
      title: 'Verification rejected',
      text: 'Check the notes on your documents and upload corrected copies.'
    },
    verified: {
      modifier: 'banner banner--verified',
      title: 'Verified operator',
      text: 'Customers see a verified badge next to your name.'
    }
  };

  function renderBanner(status) {
    var entry = BANNER[status];
    if (!entry) return;
    banner.className = entry.modifier;
    document.getElementById('bannerTitle').textContent = entry.title;

    var text = document.getElementById('bannerText');
    text.textContent = entry.text + ' ';
    if (status !== 'verified') {
      var link = document.createElement('a');
      link.href = '../Credentials/index.html';
      link.textContent = 'Go to Credentials';
      text.appendChild(link);
    }
    banner.hidden = false;
  }

  // ---------- Save ----------
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    formError.hidden = true;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    submitBtn.disabled = true;

    EquipifyApi.put('/freelancer/profile', {
      full_name: form.elements.full_name.value,
      phone: form.elements.phone.value,
      nic_number: form.elements.nic_number.value,
      address_line: form.elements.address_line.value,
      district: form.elements.district.value,
      availability_status: form.elements.availability_status.value,
      bio: form.elements.bio.value,
      // Optional fields: send null rather than '' when left blank.
      years_experience: form.elements.years_experience.value || null,
      hourly_rate: form.elements.hourly_rate.value || null,
      daily_rate: form.elements.daily_rate.value || null
    }).then(function (res) {
      submitBtn.disabled = false;
      if (!res.ok) {
        Portal.showFormError(formError, res);
        return;
      }
      // Re-render from the saved row, so what's on screen is what's stored.
      saved = res.data;
      fill(saved);
      window.showToast(form.dataset.successMessage);
    });
  });

  document.getElementById('resetProfileBtn').addEventListener('click', function () {
    if (saved) {
      fill(saved);
      formError.hidden = true;
    }
  });

  // ---------- Portfolio ----------
  // Real data: the worker's own rows in `portfolio_items` (011), paged on the
  // server like every other list in the portal.
  var portfolio = EquipifyList.create({
    endpoint: '/freelancer/portfolio',
    container: document.getElementById('portfolioList'),
    pager: document.getElementById('portfolioPager'),
    countLabel: document.getElementById('portfolioCount'),
    perPage: 6,
    emptyMessage: "No work samples yet. Add one so customers can see what you've operated.",
    renderItem: sampleCard
  });

  function sampleCard(sample) {
    var card = Portal.element('article', 'portfolio-card');

    // A sample without a photo gets a placeholder tile, so the grid stays even.
    var figure = Portal.element('div', 'portfolio-media');
    if (sample.image_path) {
      var img = document.createElement('img');
      img.src = EquipifyApi.url(sample.image_path);
      img.alt = sample.title;
      img.loading = 'lazy';
      figure.appendChild(img);
    } else {
      figure.classList.add('portfolio-media--empty');
      figure.appendChild(Portal.icon('image', 'icon'));
    }
    card.appendChild(figure);

    var body = Portal.element('div', 'portfolio-body');
    body.appendChild(Portal.element('h3', 'record-title', sample.title));

    var meta = Portal.element('p', 'record-meta');
    meta.appendChild(Portal.element('span', null, sample.equipment));
    if (sample.completed_on) {
      meta.appendChild(Portal.element('span', null, Portal.date(sample.completed_on)));
    }
    body.appendChild(meta);

    if (sample.description) {
      body.appendChild(Portal.element('p', 'portfolio-text', sample.description));
    }
    card.appendChild(body);

    return card;
  }

  // ---------- Add a work sample ----------
  var sampleForm = document.getElementById('sampleForm');
  var sampleError = document.getElementById('sampleFormError');
  var sampleSubmit = sampleForm.querySelector('button[type="submit"]');
  var sampleImage = document.getElementById('sampleImage');
  var samplePreview = document.getElementById('samplePreview');

  var MAX_PHOTO_BYTES = 3145728; // must match FreelanceWorkerController::MAX_PHOTO_BYTES

  // A photo can't be uploaded in the future, and neither can the work be done then.
  document.getElementById('sampleCompletedOn').max = new Date().toISOString().slice(0, 10);

  // Show the chosen photo before it is sent, so a wrong file is obvious.
  sampleImage.addEventListener('change', function () {
    var file = sampleImage.files[0];
    if (samplePreview.src) URL.revokeObjectURL(samplePreview.src);
    if (!file) {
      samplePreview.hidden = true;
      samplePreview.removeAttribute('src');
      return;
    }
    samplePreview.src = URL.createObjectURL(file);
    samplePreview.hidden = false;
  });

  sampleForm.addEventListener('submit', function (event) {
    event.preventDefault();
    sampleError.hidden = true;

    if (!sampleForm.checkValidity()) {
      sampleForm.reportValidity();
      return;
    }

    var file = sampleImage.files[0];
    // Checked here for a quick answer; the server checks size and real type again.
    if (file && file.size > MAX_PHOTO_BYTES) {
      failSample('That photo is over 3 MB. Try a smaller one.');
      return;
    }

    setSampleBusy(true);

    // Without a photo there is nothing to read, so the request goes straight out.
    var encoded = file ? Portal.readFileAsBase64(file) : Promise.resolve(null);

    encoded.then(function (image) {
      var body = {
        title: sampleForm.elements.title.value.trim(),
        equipment: sampleForm.elements.equipment.value.trim(),
        description: sampleForm.elements.description.value.trim(),
        completed_on: sampleForm.elements.completed_on.value
      };
      if (image) body.image = image;
      return EquipifyApi.post('/freelancer/portfolio', body);
    }).then(function (res) {
      setSampleBusy(false);
      if (!res.ok) {
        Portal.showFormError(sampleError, res);
        return;
      }
      window.showToast(sampleForm.dataset.successMessage);
      Portal.closeModal(sampleForm.closest('.modal-backdrop'));
      resetSampleForm();
      // Back to page 1: the newest sample sorts to the top.
      portfolio.reset();
    }).catch(function () {
      setSampleBusy(false);
      failSample('Could not read that photo. Try a different file.');
    });
  });

  function setSampleBusy(busy) {
    sampleSubmit.disabled = busy;
    sampleSubmit.textContent = busy ? 'Adding…' : 'Add sample';
  }

  function resetSampleForm() {
    sampleForm.reset();
    if (samplePreview.src) URL.revokeObjectURL(samplePreview.src);
    samplePreview.hidden = true;
    samplePreview.removeAttribute('src');
  }

  function failSample(message) {
    sampleError.textContent = message;
    sampleError.hidden = false;
  }
})();
