(function () {
  'use strict';

  /* ==========================================================================
     Image Gallery — arrow navigation + thumbnail click, in sync
     ========================================================================== */

  var galleryImages = [
    {
      src: 'https://lh3.googleusercontent.com/aida/AP1WRLtI0FCRgmeXBtaOnzWn6vBkotJ5DZhzUlrp7xAXtaDMvLDPMFeJqe_8vq9c2ygZXE1Nhe487TfOlqrr47xV1Kp4xSYt3o819_73d08o0yrTcK65ksQCP2tJcvNLquZsVNezFMqO_3EJEOaZ9VgmlS7CVIhhDuwqfg2dMPp9JeTKlwvWu7oh0r-1LIvWq6P4Ecjr6Ema41dbpcW6kif0wCAEdfb4_gKgz0_awkK9EqGY0e0GvmQ-TW4Ojexo',
      alt: 'CAT 320D Excavator — full machine view on site'
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCJFFWBzWRX5HQ_Z56oUIZJV1FJHJTE5HagliPELhVC2YLe1hS60-lke5lRz5GIsV5emGkI-2pmf1qVBF7hEJ0zBsjN-ZObK8Pni4a67ycXbChN1YG7szZSJUSoQZLLtjMTQSizqo8mW6Ayu_3NGl_Him_Yg6OgY2K6jS1IRnLAlPqnksKcmeciFi95cc_uTeyjajXqzldZW6-AOqaJ0QyEc0R7MzPg4tKiz9nAblnteUwoh2adfTUQrxbWumDFSg7aL7wz-INArocq',
      alt: 'Close up of the steel tracks of the CAT excavator on a construction site'
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDaHmpZisgp0wPRR-6NaIwPNCIfe4YwtsrPY37YoUeEm7xhPyWEAOtwgR1SiMsgZht62_zu8W9SMNbQY-MrOWpeVQhLsp-Kt86VhsQdZhXG87UICFHmxeX4dadGZYnaXXVaQtNllksg8BFoPINU-oEvDIrhBuXZ14-tPASxHpsORof-Eis6nqX97rgij4WobyAzaH0WiROsXsE-VlIGVQ-LydW3sSsvEMY1zHpsLjQMUlokk4gupQFt5mN3AOtK4opzfhoLnYq8Ntw_',
      alt: 'Detailed view of the digging bucket of the excavator'
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAzTlUdT5LWtWq3m5AHxm4ED620TGfNp3tbhkf13yHfC33-I86Tkh3UR_HpG3d-iSsS5j05ca1toRpMZa6v_-wDP1qTQFbEzxdJA6nZaXGJXCUM9lTqdYRUtLDGhVbU9JQ2Hg5PvQWrqP2mKTOjsxaRAuKICQ0_5ra28oxd3jN9t1VRhdrA9_uRmnNJwuFOXmNSHO5tb9loAFRIrjig0e5eIaJ9eruQyfM8GRZWitAlKBVNuD6ok3roMw7KUJeUsXs3I8dIEXOeRMmk',
      alt: 'Interior cabin view of the excavator showing controls'
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBvtzLRvEHHptZMHIIrHfYH6mjn7VIgHXOf_rfTukznkkL_OdRQLQ-2veTiLBBiZmj-x5-E0zGhyoHrWVqtt_M8cqks2V7hb5H_Gwa6vY0nyQBOHM4WbacgEacVvKi11aAker2FVs8TRgdsP6XWn7Q_zzZQrklHXLf1IVY0IbUZ_5mTsxU_CppTNeF4WoXsdplfVh-S2Mt3hyZpqOUWOUTPY2ydvJkHz-KgBzJyDmy0TiJWumr3Tjy-lDPOvAz6Of8KzpH_pt_CM_AW',
      alt: 'Engine compartment view of the excavator'
    }
  ];

  var currentIndex = 0;
  var mainImage = document.getElementById('galleryMainImage');
  var prevBtn = document.getElementById('galleryPrev');
  var nextBtn = document.getElementById('galleryNext');
  var thumbButtons = document.querySelectorAll('#galleryThumbs .gallery__thumb');

  function renderGallery() {
    var image = galleryImages[currentIndex];
    mainImage.src = image.src;
    mainImage.alt = image.alt;

    thumbButtons.forEach(function (thumb) {
      var idx = parseInt(thumb.getAttribute('data-index'), 10);
      thumb.classList.toggle('is-active', idx === currentIndex);
    });
  }

  function goToIndex(index) {
    var total = galleryImages.length;
    currentIndex = ((index % total) + total) % total; // wrap both directions
    renderGallery();
  }

  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', function () {
      goToIndex(currentIndex - 1);
    });
    nextBtn.addEventListener('click', function () {
      goToIndex(currentIndex + 1);
    });
  }

  thumbButtons.forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      var idx = parseInt(thumb.getAttribute('data-index'), 10);
      goToIndex(idx);
    });
  });

  renderGallery();

  /* ==========================================================================
     Date Picker — real selection + validation + live price recalculation
     ========================================================================== */

  var startDateInput = document.getElementById('startDate');
  var endDateInput = document.getElementById('endDate');
  var dateError = document.getElementById('dateError');

  var DAILY_RATE = 28000;
  var PLATFORM_FEE = 2500;
  var DELIVERY_FEE = 15000;

  var rateLine = document.getElementById('rateLine');
  var rateTotal = document.getElementById('rateTotal');
  var grandTotal = document.getElementById('grandTotal');
  var deliveryRow = document.getElementById('deliveryRow');

  var logisticsDeliveryRadio = document.getElementById('logisticsDeliveryRadio');
  var logisticsSelfRadio = document.getElementById('logisticsSelfRadio');
  var logisticsDeliveryOption = document.getElementById('logisticsDelivery');
  var logisticsSelfOption = document.getElementById('logisticsSelf');

  function formatLKR(amount) {
    return 'LKR ' + amount.toLocaleString('en-US');
  }

  function todayISO() {
    var d = new Date();
    var offset = d.getTimezoneOffset();
    var local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().split('T')[0];
  }

  function initDefaultDates() {
    var start = new Date();
    var end = new Date();
    end.setDate(end.getDate() + 3);

    var min = todayISO();
    startDateInput.min = min;
    endDateInput.min = min;

    startDateInput.value = start.toISOString().split('T')[0];
    endDateInput.value = end.toISOString().split('T')[0];
    endDateInput.min = startDateInput.value;
  }

  function getSelectedDays() {
    if (!startDateInput.value || !endDateInput.value) {
      return 0;
    }
    var start = new Date(startDateInput.value);
    var end = new Date(endDateInput.value);
    var msPerDay = 1000 * 60 * 60 * 24;
    var diff = Math.round((end - start) / msPerDay);
    return diff;
  }

  function isDeliverySelected() {
    return logisticsDeliveryRadio.checked;
  }

  function recalculate() {
    var days = getSelectedDays();
    var valid = days > 0;

    dateError.classList.toggle('is-visible', !valid && startDateInput.value !== '' && endDateInput.value !== '');

    var effectiveDays = valid ? days : 0;
    var rentalCost = DAILY_RATE * effectiveDays;
    var delivery = isDeliverySelected() ? DELIVERY_FEE : 0;
    var total = rentalCost + PLATFORM_FEE + delivery;

    rateLine.textContent = formatLKR(DAILY_RATE) + ' x ' + effectiveDays + (effectiveDays === 1 ? ' day' : ' days');
    rateTotal.textContent = formatLKR(rentalCost);

    deliveryRow.style.display = isDeliverySelected() ? 'flex' : 'none';

    grandTotal.textContent = formatLKR(total);
  }

  // Ensure end date can never be before the start date; keep it in sync.
  startDateInput.addEventListener('change', function () {
    if (startDateInput.value) {
      endDateInput.min = startDateInput.value;
      if (endDateInput.value && endDateInput.value < startDateInput.value) {
        endDateInput.value = startDateInput.value;
      }
    }
    recalculate();
  });

  endDateInput.addEventListener('change', function () {
    recalculate();
  });

  /* ==========================================================================
     Logistics radio — visual selected state + price recalculation
     ========================================================================== */

  function setLogisticsSelection() {
    logisticsDeliveryOption.classList.toggle('is-selected', logisticsDeliveryRadio.checked);
    logisticsSelfOption.classList.toggle('is-selected', logisticsSelfRadio.checked);
    recalculate();
  }

  logisticsDeliveryRadio.addEventListener('change', setLogisticsSelection);
  logisticsSelfRadio.addEventListener('change', setLogisticsSelection);

  /* ==========================================================================
     Mobile CTA button mirrors the main Request Rental action
     ========================================================================== */

  var requestRentalBtn = document.getElementById('requestRentalBtn');
  var mobileRequestBtn = document.getElementById('mobileRequestBtn');

  function handleRequestRental() {
    var days = getSelectedDays();
    if (days <= 0) {
      dateError.classList.add('is-visible');
      startDateInput.focus();
      return;
    }
    // Placeholder action — UI only, no backend wired up.
    alert('Rental request ready:\n' + days + ' day(s), ' + grandTotal.textContent + ' total.');
  }

  if (requestRentalBtn) {
    requestRentalBtn.addEventListener('click', handleRequestRental);
  }
  if (mobileRequestBtn) {
    mobileRequestBtn.addEventListener('click', handleRequestRental);
  }

  /* ==========================================================================
     Init
     ========================================================================== */

  initDefaultDates();
  recalculate();
})();
