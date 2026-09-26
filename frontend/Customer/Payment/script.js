/* ==========================================================================
   Equipify — Customer Payment
   Reached from "Pay Now" on Rental History with ?rental=<request ref>.
   Shows the payment deadline (the end of the day after the renting party
   accepted), the order summary and a card form.

   UI only for now: the requests below are mock data matching the "Payment
   Due" cards on Rental History, and paying only changes the page. The
   rentals module will load the request and hand the card to a payment
   gateway; the server decides the amount and the deadline.
   ========================================================================== */

(function () {
  'use strict';

  var Timing = window.EquipifyRentalTiming;

  // acceptedAgo: minutes since the renting party accepted (keeps the demo deadline live).
  var MOCK_REQUESTS = {
    'RQ-2041': {
      title: 'Bobcat S650 Skid-Steer Loader',
      icon: 'agriculture',
      owner: 'Lanka Earthmovers',
      ownerDistrict: 'Gampaha',
      start: '2026-10-03',
      end: '2026-10-10',
      units: 1,
      dailyRate: 12000,
      logistics: 'delivery',
      deliveryFee: 15000,
      deposit: 25000,
      address: 'No. 42, Temple Road, Maharagama, Colombo',
      acceptedAgo: 120
    },
    'RQ-2038': {
      title: 'Atlas Copco XAS 185 Air Compressor',
      icon: 'air',
      owner: 'Colombo Tool Hire',
      ownerDistrict: 'Colombo',
      start: '2026-10-01',
      end: '2026-10-05',
      units: 1,
      dailyRate: 6500,
      logistics: 'self',
      deliveryFee: 0,
      deposit: 10000,
      address: '',
      acceptedAgo: 1260
    }
  };

  function $(id) { return document.getElementById(id); }

  function formatLKR(amount) {
    return 'LKR ' + Number(amount).toLocaleString('en-LK', { maximumFractionDigits: 2 });
  }

  var ref = new URLSearchParams(window.location.search).get('rental') || '';
  var rental = Object.prototype.hasOwnProperty.call(MOCK_REQUESTS, ref) ? MOCK_REQUESTS[ref] : null;

  if (!rental) {
    $('stepper').hidden = true;
    $('pageSub').hidden = true;
    $('errorState').hidden = false;
    return;
  }

  var isDelivery = rental.logistics === 'delivery';
  var days = Timing.daysBetween(rental.start, rental.end);
  var rentalCost = rental.dailyRate * days * rental.units;
  var total = rentalCost + rental.deliveryFee + rental.deposit;
  var handoverDate = Timing.formatDate(Timing.dayBefore(rental.start));

  /* ---------------- Summary ---------------- */

  $('stepHandoverTitle').textContent = isDelivery ? 'Delivery' : 'Pickup';
  $('stepHandoverDate').textContent = handoverDate;

  $('summaryIcon').textContent = rental.icon;
  $('summaryTitle').textContent = rental.title;
  $('summaryOwner').textContent = 'From ' + rental.owner;
  $('summaryRef').textContent = ref;
  $('summaryStart').textContent = Timing.formatDate(rental.start);
  $('summaryEnd').textContent = Timing.formatDate(rental.end);
  $('summaryDays').textContent = days + (days === 1 ? ' day' : ' days');
  if (rental.units > 1) {
    $('summaryUnits').textContent = String(rental.units);
    $('summaryUnitsRow').hidden = false;
  }
  $('summaryHandoverLabel').textContent = isDelivery ? 'Platform delivery' : 'Self pickup';
  $('summaryHandover').textContent = handoverDate;
  $('summaryPlaceLabel').textContent = isDelivery ? 'Deliver to' : 'Pick up in';
  $('summaryPlace').textContent = isDelivery ? rental.address : rental.ownerDistrict;

  $('priceRateLine').textContent = formatLKR(rental.dailyRate) + ' x ' + days + (days === 1 ? ' day' : ' days') +
    (rental.units > 1 ? ' x ' + rental.units + ' units' : '');
  $('priceRateTotal').textContent = formatLKR(rentalCost);
  $('priceDeliveryRow').hidden = !isDelivery;
  $('priceDelivery').textContent = formatLKR(rental.deliveryFee);
  if (rental.deposit > 0) {
    $('priceDeposit').textContent = formatLKR(rental.deposit);
    $('priceDepositRow').hidden = false;
    $('depositNote').hidden = false;
  }
  $('priceTotal').textContent = formatLKR(total);
  $('payBtnText').textContent = 'Pay ' + formatLKR(total);

  $('paymentView').hidden = false;

  /* ---------------- Deadline ---------------- */

  var banner = $('deadlineBanner');
  banner.setAttribute('data-accepted-ago', String(rental.acceptedAgo));
  Timing.resolveMockDeadlines(document);

  var paid = false;
  Timing.startCountdowns(document, function () {
    if (paid) return;
    banner.hidden = true;
    $('closedBanner').hidden = false;
    $('payFieldset').disabled = true;
    $('payBtn').disabled = true;
    $('pageSub').textContent = 'This request was cancelled because it wasn\'t paid in time.';
    $('stepPayment').classList.remove('is-current');
  });

  /* ---------------- Card input formatting ---------------- */

  var cardNumber = $('cardNumber');
  var cardExpiry = $('cardExpiry');
  var cardCvc = $('cardCvc');

  cardNumber.addEventListener('input', function () {
    var digits = cardNumber.value.replace(/\D/g, '').slice(0, 19);
    cardNumber.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  });

  cardExpiry.addEventListener('input', function (event) {
    var digits = cardExpiry.value.replace(/\D/g, '').slice(0, 4);
    // Don't re-add the slash while the customer is deleting it.
    var deleting = event.inputType && event.inputType.indexOf('delete') === 0;
    cardExpiry.value = digits.length > 2 || (digits.length === 2 && !deleting)
      ? digits.slice(0, 2) + '/' + digits.slice(2)
      : digits;
  });

  cardCvc.addEventListener('input', function () {
    cardCvc.value = cardCvc.value.replace(/\D/g, '').slice(0, 4);
  });

  /* ---------------- Validation ---------------- */

  function passesLuhn(digits) {
    var sum = 0;
    for (var i = 0; i < digits.length; i++) {
      var n = Number(digits.charAt(digits.length - 1 - i));
      if (i % 2 === 1) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
    }
    return sum % 10 === 0;
  }

  function expiryInFuture(value) {
    var m = /^(\d{2})\/(\d{2})$/.exec(value);
    if (!m) return false;
    var month = Number(m[1]);
    if (month < 1 || month > 12) return false;
    // A card is valid through the last day of its expiry month.
    var endOfMonth = new Date(2000 + Number(m[2]), month, 1);
    return endOfMonth > new Date();
  }

  var checks = [
    { id: 'cardName', test: function (v) { return v.trim().length >= 2; } },
    { id: 'cardNumber', test: function (v) { var d = v.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && passesLuhn(d); } },
    { id: 'cardExpiry', test: expiryInFuture },
    { id: 'cardCvc', test: function (v) { return /^\d{3,4}$/.test(v); } }
  ];

  function setError(input, show) {
    input.classList.toggle('input-error', show);
    input.setAttribute('aria-invalid', show ? 'true' : 'false');
    $(input.id + 'Error').classList.toggle('is-visible', show);
  }

  function validate() {
    var firstInvalid = null;
    checks.forEach(function (check) {
      var input = $(check.id);
      var ok = check.test(input.value);
      setError(input, !ok);
      if (!ok && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  checks.forEach(function (check) {
    var input = $(check.id);
    input.addEventListener('input', function () {
      if (input.classList.contains('input-error') && check.test(input.value)) setError(input, false);
    });
  });

  /* ---------------- Pay (UI only) ---------------- */

  $('payForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if ($('payBtn').disabled || !validate()) return;

    // Placeholder: the rentals module will send this to the payment gateway
    // and confirm the rental server-side.
    paid = true;
    $('successText').textContent = formatLKR(total) + ' paid for ' + rental.title + '. Your rental is confirmed. ' +
      (isDelivery
        ? 'Equipify will deliver it on ' + handoverDate + '.'
        : 'Collect it from ' + rental.owner + ' in ' + rental.ownerDistrict + ' on ' + handoverDate + '. The pickup address is in your receipt.');

    $('stepPayment').classList.remove('is-current');
    $('stepPayment').classList.add('is-done');
    $('stepHandover').classList.add('is-current');
    $('paymentView').hidden = true;
    $('backLink').hidden = true;
    $('pageSub').textContent = 'Payment complete.';

    var panel = $('successPanel');
    panel.hidden = false;
    panel.focus();
    window.scrollTo(0, 0);
  });
})();
