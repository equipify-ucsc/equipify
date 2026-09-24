(function () {
  'use strict';

  /* ==========================================================================
     Equipify — equipment detail page. Loads one listing from
     GET /equipment/{id} (?id= in the URL) and renders its gallery, the type's
     spec values, the renting party, and a booking estimate priced by the day.
     ========================================================================== */

  /* ==========================================================================
     Top Nav — mobile search toggle
     ========================================================================== */

  var searchToggle = document.getElementById('mobile-search-toggle');
  var searchPanel = document.getElementById('mobile-search-panel');

  if (searchToggle && searchPanel) {
    searchToggle.addEventListener('click', function () {
      var isOpen = !searchPanel.hidden;
      searchPanel.hidden = isOpen;
      searchToggle.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) {
        var input = searchPanel.querySelector('input');
        if (input) input.focus();
      }
    });
  }

  // Searching from this page goes to the Browsing page with the term.
  document.querySelectorAll('.nav-search__input').forEach(function (input) {
    function go() {
      var q = input.value.trim();
      window.location.href = '../Browsing page/index.html' + (q ? '?q=' + encodeURIComponent(q) : '');
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    var button = input.parentElement.querySelector('.nav-search__button');
    if (button) button.addEventListener('click', go);
  });

  /* ==========================================================================
     Helpers
     ========================================================================== */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function symbol(name) {
    var span = el('span', 'material-symbols-outlined', name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  function formatLKR(amount) {
    return 'LKR ' + Number(amount).toLocaleString('en-LK', { maximumFractionDigits: 2 });
  }

  var listing = null;

  /* ==========================================================================
     Load the listing
     ========================================================================== */

  var loadState = document.getElementById('loadState');
  var detailGrid = document.getElementById('detailGrid');
  var id = new URLSearchParams(window.location.search).get('id');

  function showMissing(text) {
    loadState.textContent = text;
    loadState.classList.add('load-state--error');
    var back = el('a', null, ' Browse all equipment');
    back.href = '../Browsing page/index.html';
    loadState.appendChild(back);
  }

  if (!id || !/^\d+$/.test(id)) {
    showMissing('No equipment was selected.');
    return;
  }

  EquipifyApi.get('/equipment/' + id).then(function (res) {
    if (!res.ok) {
      showMissing(res.status === 404 ? 'This equipment is no longer available.' : res.error);
      return;
    }
    listing = res.data;
    render(listing);
    loadState.hidden = true;
    detailGrid.hidden = false;
    initBooking();
  });

  /* ==========================================================================
     Render
     ========================================================================== */

  function render(item) {
    document.title = item.title + ' | Equipify';

    // Breadcrumb: Browse › Category › Type › Title, each step filtering the browse page.
    var crumbs = document.getElementById('breadcrumbs');
    crumbs.textContent = '';
    var steps = [
      ['Browse', '../Browsing page/index.html'],
      [item.category_name, '../Browsing page/index.html?category=' + item.category_id],
      [item.type_name, '../Browsing page/index.html?category=' + item.category_id + '&type=' + item.type_id]
    ];
    steps.forEach(function (step) {
      var a = el('a', null, step[0]);
      a.href = step[1];
      crumbs.appendChild(a);
      var sep = symbol('chevron_right');
      sep.classList.add('breadcrumbs__sep');
      crumbs.appendChild(sep);
    });
    crumbs.appendChild(el('span', 'breadcrumbs__current', item.title));

    // Header
    document.getElementById('typeBadge').textContent = item.type_name;
    document.getElementById('conditionChip').textContent = item.condition_label + ' condition';
    document.getElementById('districtText').textContent = item.district;
    document.getElementById('equipmentTitle').textContent = item.title;
    var sub = [item.brand, item.model].filter(Boolean).join(' ');
    document.getElementById('equipmentSub').textContent = sub ? sub + (item.year_made ? ' · ' + item.year_made : '') : '';

    renderGallery(item);
    renderSpecs(item);

    if (item.description) {
      document.getElementById('descriptionText').textContent = item.description;
      document.getElementById('aboutSection').hidden = false;
    }

    // Renting party
    var owner = item.owner;
    document.getElementById('partyInitials').textContent = owner.business_name.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
    document.getElementById('partyName').textContent = owner.business_name;
    document.getElementById('partyVerified').hidden = !owner.verified;
    var partyBits = ['Based in ' + owner.district, 'On Equipify since ' + owner.member_since];
    if (owner.rating_count > 0) partyBits.push('★ ' + owner.avg_rating.toFixed(1) + ' (' + owner.rating_count + ' reviews)');
    document.getElementById('partySub').textContent = partyBits.join(' • ');

    // Self pickup happens at the renting party's district.
    document.getElementById('pickupDesc').textContent =
      'Collect it from the renting party in ' + item.district + ' and return it with your own transport.';

    // Price + availability
    document.getElementById('dailyPrice').textContent = formatLKR(item.daily_rate_lkr);
    var availability = document.getElementById('availabilityText');
    var labels = { available: 'Available Now', on_rent: 'Currently on rent', maintenance: 'In maintenance' };
    availability.textContent = labels[item.status] || item.status_label;
    availability.classList.toggle('pricing-header__status--muted', item.status !== 'available');
  }

  function renderSpecs(item) {
    var grid = document.getElementById('specsGrid');
    grid.textContent = '';

    function add(icon, label, value) {
      var cell = el('div', 'spec-item');
      var l = el('span', 'spec-item__label');
      if (icon) l.appendChild(symbol(icon));
      l.appendChild(document.createTextNode(' ' + label));
      cell.appendChild(l);
      cell.appendChild(el('span', 'spec-item__value', value));
      grid.appendChild(cell);
    }

    // The type's own spec fields first, then the facts every listing has.
    item.specs.forEach(function (spec) { add(null, spec.label, spec.display); });
    if (item.year_made) add('calendar_month', 'Year', String(item.year_made));
    add('verified', 'Condition', item.condition_label);
    if (item.quantity > 1) add('inventory_2', 'Units available', String(item.quantity));

    if (item.extra_specs) {
      document.getElementById('extraSpecsText').textContent = item.extra_specs;
      document.getElementById('extraSpecs').hidden = false;
    }
  }

  /* ==========================================================================
     Image Gallery — arrow navigation + thumbnail click, in sync
     ========================================================================== */

  var galleryImages = [];
  var currentIndex = 0;
  var mainImage = document.getElementById('galleryMainImage');

  function renderGallery(item) {
    galleryImages = item.photos.map(function (p, i) {
      return { src: EquipifyApi.url(p.url), alt: item.title + ' — photo ' + (i + 1) };
    });
    document.getElementById('galleryEmptyIcon').textContent = item.category_icon || 'construction';
    document.getElementById('galleryEmpty').hidden = galleryImages.length > 0;
    mainImage.hidden = galleryImages.length === 0;
    document.getElementById('galleryNav').hidden = galleryImages.length < 2;

    var thumbs = document.getElementById('galleryThumbs');
    thumbs.textContent = '';
    if (galleryImages.length > 1) {
      galleryImages.forEach(function (image, index) {
        var thumb = el('button', 'gallery__thumb');
        thumb.type = 'button';
        thumb.setAttribute('aria-label', 'Show photo ' + (index + 1));
        var img = el('img');
        img.src = image.src;
        img.alt = '';
        thumb.appendChild(img);
        thumb.addEventListener('click', function () { goToIndex(index); });
        thumbs.appendChild(thumb);
      });
    }
    if (galleryImages.length) goToIndex(0);
  }

  function goToIndex(index) {
    var total = galleryImages.length;
    if (!total) return;
    currentIndex = ((index % total) + total) % total; // wrap both directions
    mainImage.src = galleryImages[currentIndex].src;
    mainImage.alt = galleryImages[currentIndex].alt;
    document.querySelectorAll('#galleryThumbs .gallery__thumb').forEach(function (thumb, i) {
      thumb.classList.toggle('is-active', i === currentIndex);
    });
  }

  document.getElementById('galleryPrev').addEventListener('click', function () { goToIndex(currentIndex - 1); });
  document.getElementById('galleryNext').addEventListener('click', function () { goToIndex(currentIndex + 1); });

  /* ==========================================================================
     Booking estimate — days × units × daily rate, plus fees
     The platform fee and delivery estimate stay fixed until the rentals
     module prices them.
     ========================================================================== */

  var PLATFORM_FEE = 2500;
  var DELIVERY_FEE = 15000;

  var startDateInput = document.getElementById('startDate');
  var endDateInput = document.getElementById('endDate');
  var dateError = document.getElementById('dateError');
  var unitInput = document.getElementById('unitCount');
  var rateLine = document.getElementById('rateLine');
  var rateTotal = document.getElementById('rateTotal');
  var grandTotal = document.getElementById('grandTotal');
  var deliveryRow = document.getElementById('deliveryRow');
  var logisticsDeliveryRadio = document.getElementById('logisticsDeliveryRadio');
  var logisticsSelfRadio = document.getElementById('logisticsSelfRadio');
  var logisticsDeliveryOption = document.getElementById('logisticsDelivery');
  var logisticsSelfOption = document.getElementById('logisticsSelf');

  function todayISO(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
  }

  function getSelectedDays() {
    if (!startDateInput.value || !endDateInput.value) return 0;
    var msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((new Date(endDateInput.value) - new Date(startDateInput.value)) / msPerDay);
  }

  function units() {
    var max = listing.quantity;
    var n = parseInt(unitInput.value, 10);
    if (!(n >= 1)) n = 1;
    return Math.min(n, max);
  }

  function recalculate() {
    var days = getSelectedDays();
    var valid = days > 0;
    dateError.classList.toggle('is-visible', !valid && startDateInput.value !== '' && endDateInput.value !== '');

    var effectiveDays = valid ? days : 0;
    var count = units();
    var rentalCost = listing.daily_rate_lkr * effectiveDays * count;
    var delivery = logisticsDeliveryRadio.checked ? DELIVERY_FEE : 0;

    rateLine.textContent = formatLKR(listing.daily_rate_lkr) + ' x ' + effectiveDays + (effectiveDays === 1 ? ' day' : ' days') +
      (count > 1 ? ' x ' + count + ' units' : '');
    rateTotal.textContent = formatLKR(rentalCost);
    deliveryRow.style.display = logisticsDeliveryRadio.checked ? 'flex' : 'none';
    grandTotal.textContent = formatLKR(rentalCost + PLATFORM_FEE + delivery);
  }

  function setLogisticsSelection() {
    logisticsDeliveryOption.classList.toggle('is-selected', logisticsDeliveryRadio.checked);
    logisticsSelfOption.classList.toggle('is-selected', logisticsSelfRadio.checked);
    recalculate();
  }

  function initBooking() {
    startDateInput.min = todayISO();
    endDateInput.min = todayISO();
    startDateInput.value = todayISO();
    endDateInput.value = todayISO(3);

    if (listing.quantity > 1) {
      document.getElementById('quantityField').hidden = false;
      unitInput.max = String(listing.quantity);
      document.getElementById('unitMax').textContent = '(up to ' + listing.quantity + ')';
    }

    if (listing.deposit_lkr > 0) {
      document.getElementById('depositValue').textContent = formatLKR(listing.deposit_lkr);
      document.getElementById('depositRow').hidden = false;
    }

    startDateInput.addEventListener('change', function () {
      if (startDateInput.value) {
        endDateInput.min = startDateInput.value;
        if (endDateInput.value && endDateInput.value < startDateInput.value) {
          endDateInput.value = startDateInput.value;
        }
      }
      recalculate();
    });
    endDateInput.addEventListener('change', recalculate);
    unitInput.addEventListener('input', recalculate);
    logisticsDeliveryRadio.addEventListener('change', setLogisticsSelection);
    logisticsSelfRadio.addEventListener('change', setLogisticsSelection);

    var requestRentalBtn = document.getElementById('requestRentalBtn');
    if (listing.status !== 'available') {
      requestRentalBtn.disabled = true;
    }
    requestRentalBtn.addEventListener('click', function () {
      var days = getSelectedDays();
      if (days <= 0) {
        dateError.classList.add('is-visible');
        startDateInput.focus();
        return;
      }
      // Placeholder action — the rentals module will submit this request.
      window.alert('Rental request ready:\n' + days + ' day(s), ' + grandTotal.textContent + ' total.');
    });

    recalculate();
  }
})();
