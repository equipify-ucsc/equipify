/* ==========================================================================
   Equipify — Freelance Worker Dashboard

   Two fetches, no hardcoded rows:
     GET /freelancer/profile   (real: users + freelance_workers) for the greeting
       name, rating, verification banner and the availability toggle
     GET /freelancer/dashboard (placeholder until the jobs/payments tables
       exist) for the remaining tiles, the earnings chart, the latest offers and
       the activity feed

   Changing the availability select saves immediately with
   PUT /freelancer/availability, which writes freelance_workers.availability_status.
   ========================================================================== */

(function () {
  'use strict';

  var availabilitySelect = document.getElementById('availabilitySelect');
  var banner = document.getElementById('verificationBanner');

  // ---------- Verification banner ----------
  // freelance_workers.verification_status decides both the wording and which
  // banner colour the page shows.
  var BANNER = {
    pending: {
      modifier: 'banner',
      title: 'Your account is awaiting verification',
      text: 'Upload your NIC, licence and certificates so an admin can verify you. Verified operators show up higher when customers search.'
    },
    rejected: {
      modifier: 'banner banner--rejected',
      title: 'Your verification was rejected',
      text: 'Check the notes on your documents, then upload corrected copies.'
    },
    verified: {
      modifier: 'banner banner--verified',
      title: "You're a verified operator",
      text: 'Customers can see your verified badge on every offer you respond to.'
    }
  };

  function renderBanner(status) {
    var entry = BANNER[status];
    if (!entry || !banner) return;

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

  // ---------- Profile (real data) ----------
  EquipifyApi.get('/freelancer/profile').then(function (res) {
    if (!res.ok) {
      window.showToast(res.error);
      return;
    }
    var profile = res.data;

    renderBanner(profile.verification_status);
    document.getElementById('verificationValue').textContent =
      Portal.label('verification', profile.verification_status);

    var rating = document.getElementById('ratingValue');
    rating.textContent = profile.rating_count === 0
      ? 'Not rated yet'
      : profile.avg_rating.toFixed(2) + ' from ' + profile.rating_count + ' ratings';

    availabilitySelect.value = profile.availability_status;
    availabilitySelect.disabled = false;
  });

  // The select stays disabled until the current value is known, so a slow
  // profile fetch can't be overwritten by a change the user makes first.
  availabilitySelect.addEventListener('change', function () {
    var chosen = availabilitySelect.value;
    availabilitySelect.disabled = true;

    EquipifyApi.put('/freelancer/availability', { availability_status: chosen }).then(function (res) {
      availabilitySelect.disabled = false;
      window.showToast(res.ok
        ? 'You are now marked as ' + Portal.label('availability', chosen).toLowerCase() + '.'
        : res.error);
    });
  });

  // ---------- Dashboard figures (placeholder data) ----------
  EquipifyApi.get('/freelancer/dashboard').then(function (res) {
    if (!res.ok) {
      window.showToast(res.error);
      return;
    }
    var data = res.data;

    document.querySelectorAll('[data-stat]').forEach(function (el) {
      el.textContent = data.stats[el.dataset.stat];
    });
    document.getElementById('monthEarnings').textContent = Portal.money(data.stats.month_earnings);

    renderChart(data.earnings_chart);
    renderOffers(data.recent_offers);
    renderActivity(data.recent_activity);
  });

  function renderChart(weeks) {
    var chart = document.getElementById('earningsChart');
    chart.textContent = '';
    weeks.forEach(function (week) {
      var column = Portal.element('div', 'bar-col');
      var bar = Portal.element('div', 'bar');
      // The server sends the height as a percentage so the page doesn't have
      // to know the scale.
      bar.style.height = week.height_pct + '%';
      bar.title = week.label + ': ' + Portal.money(week.amount_lkr);
      column.appendChild(bar);
      column.appendChild(Portal.element('span', 'bar-label', week.label));
      chart.appendChild(column);
    });
  }

  function renderOffers(offers) {
    var list = document.getElementById('recentOffers');
    list.textContent = '';
    if (!offers.length) {
      list.appendChild(Portal.element('p', 'list-state', 'No open offers right now.'));
      return;
    }
    offers.forEach(function (offer) {
      var card = Portal.element('div', 'record-card');

      var head = Portal.element('div', 'record-head');
      var titles = document.createElement('div');
      titles.appendChild(Portal.element('h3', 'record-title', offer.title));
      titles.appendChild(Portal.element('p', 'record-ref', offer.job_ref + ' · ' + offer.customer_name));
      head.appendChild(titles);
      head.appendChild(Portal.badge('offer', offer.status));
      card.appendChild(head);

      var meta = Portal.element('p', 'record-meta');
      meta.appendChild(Portal.element('span', null, offer.district));
      meta.appendChild(Portal.element('span', null, Portal.date(offer.start_date) + ' · ' + offer.duration_days + ' days'));
      meta.appendChild(Portal.element('span', 'record-amount', Portal.money(offer.budget_lkr)));
      card.appendChild(meta);

      list.appendChild(card);
    });
  }

  function renderActivity(rows) {
    var body = document.querySelector('#activityTable tbody');
    body.textContent = '';
    if (!rows.length) {
      var empty = Portal.cell('Nothing here yet.', { className: 'list-state' });
      empty.colSpan = 3;
      var emptyRow = document.createElement('tr');
      emptyRow.appendChild(empty);
      body.appendChild(emptyRow);
      return;
    }
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.appendChild(Portal.cell(Portal.dateTime(row.when), { className: 'cell-muted' }));
      tr.appendChild(Portal.cellWith(Portal.badge('notificationType', row.type)));
      tr.appendChild(Portal.cell(row.detail));
      body.appendChild(tr);
    });
  }
})();
