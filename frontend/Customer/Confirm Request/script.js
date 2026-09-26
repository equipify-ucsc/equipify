/* ==========================================================================
   Equipify — Customer Confirm Rental Request
   Reached from the Detailed page's "Place Rental Request" with
   ?id=&start=&end=&units=&logistics=delivery|self. Loads the listing from
   GET /equipment/{id} for the summary, collects the delivery address (or
   shows the pickup note), the on-site contact, notes and the agreement,
   then confirms the request.

   UI only for now: submitting doesn't call an API yet. It shows the request
   timeline built from shared/rental-timing.js. The rentals module will POST
   the request, and the server will decide the real deadlines and price.
   ========================================================================== */

(function () {
  'use strict';

  var Timing = window.EquipifyRentalTiming;
  var DELIVERY_FEE = 15000;

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatLKR(amount) {
    return 'LKR ' + Number(amount).toLocaleString('en-LK', { maximumFractionDigits: 2 });
  }

  /* ---------------- Read and check the request from the URL ---------------- */

  var params = new URLSearchParams(window.location.search);
  var request = {
    id: params.get('id') || '',
    start: params.get('start') || '',
    end: params.get('end') || '',
    units: parseInt(params.get('units') || '1', 10),
    logistics: params.get('logistics') || 'delivery'
  };
  var isDelivery = request.logistics === 'delivery';
  var detailUrl = '../Detailed page/index.html' + (/^\d+$/.test(request.id) ? '?id=' + request.id : '');

  $('backLink').href = detailUrl;
  $('errorBackLink').href = detailUrl;
  $('cancelLink').href = detailUrl;
  $('changeHandoverLink').href = detailUrl;

  var loadState = $('loadState');

  function showError(text) {
    loadState.hidden = true;
    $('stepper').hidden = true;
    $('errorText').textContent = text;
    $('errorState').hidden = false;
  }

  function checkRequest() {
    if (!/^\d+$/.test(request.id)) return 'No equipment was selected.';
    if (!Timing.parseISODate(request.start) || !Timing.parseISODate(request.end)) {
      return 'The rental dates are missing. Pick your dates on the equipment page.';
    }
    if (request.start < Timing.earliestStartISO()) {
      return 'Rentals must start on or after ' + Timing.formatDate(Timing.earliestStartISO()) +
        ', so there is time for the renting party to respond, for payment and for delivery. Pick new dates on the equipment page.';
    }
    if (request.end <= request.start) return 'The end date must be after the start date.';
    if (!(request.units >= 1)) return 'The number of units is not valid.';
    if (request.logistics !== 'delivery' && request.logistics !== 'self') return 'Choose platform delivery or self pickup.';
    return '';
  }

  var problem = checkRequest();
  if (problem) {
    showError(problem);
    return;
  }

  var listing = null;
  var days = Timing.daysBetween(request.start, request.end);
  var handoverDate = Timing.dayBefore(request.start);

  EquipifyApi.get('/equipment/' + request.id).then(function (res) {
    if (!res.ok) {
      showError(res.status === 404 ? 'This equipment is no longer available.' : res.error);
      return;
    }
    listing = res.data;
    if (listing.status !== 'available') {
      showError('This equipment isn\'t available to rent right now.');
      return;
    }
    request.units = Math.min(request.units, listing.quantity || 1);
    renderHandover();
    renderSummary();
    loadState.hidden = true;
    $('confirmGrid').hidden = false;
  });

  /* ---------------- Handover ---------------- */

  function renderHandover() {
    var dateText = Timing.formatDate(handoverDate);

    $('stepHandoverTitle').textContent = isDelivery ? 'Delivery' : 'Pickup';
    $('stepHandoverDate').textContent = dateText;

    if (isDelivery) {
      $('handoverIcon').textContent = 'local_shipping';
      $('handoverTitle').textContent = 'Equipify platform delivery';
      $('handoverDesc').textContent = 'Our delivery team brings it to your site and collects it afterwards.';
      $('deliveryDate').textContent = dateText;
      $('contactDesc').textContent = 'The person at the site who will receive the equipment.';
    } else {
      $('handoverIcon').textContent = 'hail';
      $('handoverTitle').textContent = 'Self pickup';
      $('handoverDesc').textContent = 'You collect it and return it with your own transport.';
      $('deliveryFields').hidden = true;
      $('pickupNote').hidden = false;
      $('pickupNoteText').textContent = 'Collect it from ' + listing.owner.business_name + ' in ' + listing.district +
        ' on ' + dateText + ', the day before your rental starts. The exact pickup address is shared after payment.';
      $('contactDesc').textContent = 'The person who will collect the equipment.';
    }
  }

  /* ---------------- Summary ---------------- */

  function renderSummary() {
    var photo = listing.photos && listing.photos[0];
    if (photo) {
      var img = el('img');
      img.src = EquipifyApi.url(photo.url);
      img.alt = '';
      var thumb = $('summaryThumb');
      thumb.textContent = '';
      thumb.appendChild(img);
    } else {
      $('summaryThumbIcon').textContent = listing.category_icon || 'construction';
    }

    $('summaryTitle').textContent = listing.title;
    $('summaryOwner').textContent = 'From ' + listing.owner.business_name + ' · ' + listing.district;
    $('summaryStart').textContent = Timing.formatDate(request.start);
    $('summaryEnd').textContent = Timing.formatDate(request.end);
    $('summaryDays').textContent = days + (days === 1 ? ' day' : ' days');
    if (request.units > 1) {
      $('summaryUnits').textContent = String(request.units);
      $('summaryUnitsRow').hidden = false;
    }
    $('summaryHandover').textContent = isDelivery ? 'Platform delivery' : 'Self pickup';

    var rentalCost = listing.daily_rate_lkr * days * request.units;
    var delivery = isDelivery ? DELIVERY_FEE : 0;

    $('priceRateLine').textContent = formatLKR(listing.daily_rate_lkr) + ' x ' + days + (days === 1 ? ' day' : ' days') +
      (request.units > 1 ? ' x ' + request.units + ' units' : '');
    $('priceRateTotal').textContent = formatLKR(rentalCost);
    $('priceDeliveryRow').hidden = !isDelivery;
    $('priceDelivery').textContent = formatLKR(DELIVERY_FEE);
    if (listing.deposit_lkr > 0) {
      $('priceDeposit').textContent = formatLKR(listing.deposit_lkr);
      $('priceDepositRow').hidden = false;
    }
    $('priceTotal').textContent = formatLKR(rentalCost + delivery);
  }

  /* ---------------- Notes counter ---------------- */

  var notes = $('notes');
  notes.addEventListener('input', function () {
    $('notesCounter').textContent = notes.value.length + ' / 500';
  });

  /* ---------------- Validation ---------------- */

  // Sri Lankan mobile numbers: 07XXXXXXXX or +947XXXXXXXX (spaces/dashes allowed).
  function isMobile(value) {
    return /^(?:0|\+94)7\d{8}$/.test(value.replace(/[\s-]/g, ''));
  }

  var checks = [
    { id: 'addressLine1', deliveryOnly: true, test: function (v) { return v.trim() !== ''; } },
    { id: 'city', deliveryOnly: true, test: function (v) { return v.trim() !== ''; } },
    { id: 'district', deliveryOnly: true, test: function (v) { return v !== ''; } },
    { id: 'contactName', test: function (v) { return v.trim().length >= 2; } },
    { id: 'contactPhone', test: isMobile }
  ];

  function setError(input, errorEl, show) {
    input.classList.toggle('input-error', show);
    input.setAttribute('aria-invalid', show ? 'true' : 'false');
    errorEl.classList.toggle('is-visible', show);
  }

  function validate() {
    var firstInvalid = null;

    checks.forEach(function (check) {
      if (check.deliveryOnly && !isDelivery) return;
      var input = $(check.id);
      var ok = check.test(input.value);
      setError(input, $(check.id + 'Error'), !ok);
      if (!ok && !firstInvalid) firstInvalid = input;
    });

    var agree = $('agreeTerms');
    $('agreeTermsError').classList.toggle('is-visible', !agree.checked);
    if (!agree.checked && !firstInvalid) firstInvalid = agree;

    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  // Clear a field's error as soon as the customer fixes it.
  checks.forEach(function (check) {
    var input = $(check.id);
    var eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, function () {
      if (input.classList.contains('input-error') && check.test(input.value)) {
        setError(input, $(check.id + 'Error'), false);
      }
    });
  });
  $('agreeTerms').addEventListener('change', function () {
    if (this.checked) $('agreeTermsError').classList.remove('is-visible');
  });

  /* ---------------- Submit (UI only) ---------------- */

  $('confirmForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!validate()) return;

    // Placeholder: the rentals module will POST this request and return its
    // server-side deadlines. Until then the timeline is computed here.
    showSuccess(new Date());
  });

  function timelineItem(state, icon, title, meta) {
    var li = el('li', 'timeline__item' + (state ? ' is-' + state : ''));
    var marker = el('span', 'timeline__marker');
    var symbol = el('span', 'icon', icon);
    symbol.setAttribute('aria-hidden', 'true');
    marker.appendChild(symbol);
    var body = el('div');
    body.appendChild(el('p', 'timeline__title', title));
    body.appendChild(el('p', 'timeline__meta', meta));
    li.appendChild(marker);
    li.appendChild(body);
    return li;
  }

  function showSuccess(sentAt) {
    var owner = listing.owner.business_name;
    var responseBy = Timing.deadlineFrom(sentAt, Timing.RESPONSE_DAYS);

    $('successHeading').textContent = 'Request sent to ' + owner;
    $('successText').textContent = 'Your request for ' + listing.title + ' is waiting for the renting party. ' +
      'Nothing is charged yet. We\'ll notify you when they respond.';

    var list = $('successTimeline');
    list.textContent = '';
    list.appendChild(timelineItem('done', 'check', 'Request sent', Timing.formatDateTime(sentAt)));
    list.appendChild(timelineItem('next', 'hourglass_top', owner + ' accepts or rejects',
      'By ' + Timing.formatDateTime(responseBy) + '. If there\'s no response by then, the request is cancelled.'));
    list.appendChild(timelineItem('', 'payments', 'You pay',
      'By the end of the day after it is accepted. Unpaid requests are cancelled.'));
    list.appendChild(timelineItem('', isDelivery ? 'local_shipping' : 'hail',
      isDelivery ? 'Equipify delivers to your site' : 'You collect the equipment',
      Timing.formatDate(handoverDate)));
    list.appendChild(timelineItem('', 'event_available', 'Rental period',
      Timing.formatDate(request.start) + ' – ' + Timing.formatDate(request.end)));

    // Stepper: details done, owner response is now current.
    document.querySelectorAll('.stepper__step').forEach(function (step) {
      var n = Number(step.getAttribute('data-step'));
      step.classList.toggle('is-done', n === 1);
      step.classList.toggle('is-current', n === 2);
    });

    $('confirmGrid').hidden = true;
    $('backLink').hidden = true;
    var panel = $('successPanel');
    panel.hidden = false;
    panel.focus();
    window.scrollTo(0, 0);
  }
})();
