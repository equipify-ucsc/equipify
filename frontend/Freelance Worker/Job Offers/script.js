/* ==========================================================================
   Equipify — Freelance Worker / Job Offers

   Two tabs over one endpoint: "Open offers" lists jobs posted to operators,
   "My bids" lists the bids this worker has placed. Both come from
   GET /freelancer/job-offers with ?tab=, and searching, filtering and paging
   are all query params handled by the server (see EquipifyList), so a filter
   narrows the whole result set, not just the page on screen.

   An operator cannot take a job directly. The only way onto one is a bid: the
   customer compares the bids and awards the job, which is what makes an offer
   'accepted'. So an open offer here has two actions: bid, or decline it (it
   then reads Declined for this worker only). There is deliberately no Accept
   button and no accept endpoint behind one.

   Every job is fixed-price: budget_lkr is the customer's total for the whole
   job, and a bid is the worker's total. The server allows one bid per job, so
   an open offer the worker already bid on shows their bid instead of the
   actions.
   ========================================================================== */

(function () {
  'use strict';

  var statusFilter = document.getElementById('statusFilter');

  // Each tab filters by its own status vocabulary, so the select is rebuilt
  // when the tab changes rather than offering statuses that can't match.
  var STATUS_OPTIONS = {
    offers: ['open', 'accepted', 'declined', 'expired'],
    bids:   ['submitted', 'shortlisted', 'won', 'lost']
  };

  var currentTab = 'offers';

  function fillStatusOptions(tab) {
    statusFilter.textContent = '';
    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'All statuses';
    statusFilter.appendChild(all);

    STATUS_OPTIONS[tab].forEach(function (value) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = Portal.label(tab === 'bids' ? 'bid' : 'offer', value);
      statusFilter.appendChild(option);
    });
  }
  fillStatusOptions(currentTab);

  // ---------- The list ----------
  var list = EquipifyList.create({
    endpoint: '/freelancer/job-offers',
    container: document.getElementById('offerList'),
    searchInput: document.getElementById('offerSearch'),
    filters: {
      status: statusFilter,
      district: document.getElementById('districtFilter')
    },
    pager: document.getElementById('offerPager'),
    countLabel: document.getElementById('offerCount'),
    extraParams: { tab: currentTab },
    perPage: 8,
    emptyMessage: 'No job offers match these filters.',
    renderItem: function (row) {
      return currentTab === 'bids' ? bidCard(row) : offerCard(row);
    }
  });

  // ---------- Tabs ----------
  document.querySelectorAll('#offerTabs .filter-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      if (tab.dataset.tab === currentTab) return;

      document.querySelectorAll('#offerTabs .filter-tab').forEach(function (other) {
        other.classList.toggle('is-active', other === tab);
      });
      currentTab = tab.dataset.tab;

      // A status from the other tab would match nothing, so clear it first.
      // The clear is deferred so the tab switch is a single request.
      fillStatusOptions(currentTab);
      list.setFilter('status', '', true);
      list.setParam('tab', currentTab);
    });
  });

  // ---------- Cards ----------
  function cardShell(row, statusVocabulary) {
    var card = Portal.element('div', 'record-card');

    var head = Portal.element('div', 'record-head');
    var titles = document.createElement('div');
    titles.appendChild(Portal.element('h3', 'record-title', row.title));
    titles.appendChild(Portal.element('p', 'record-ref', row.job_ref + ' · ' + row.customer_name));
    head.appendChild(titles);
    head.appendChild(Portal.badge(statusVocabulary, row.status));
    card.appendChild(head);

    return card;
  }

  function offerCard(offer) {
    var card = cardShell(offer, 'offer');

    var meta = Portal.element('p', 'record-meta');
    meta.appendChild(metaItem('location_on', offer.district + ' · ' + offer.site));
    meta.appendChild(metaItem('precision_manufacturing', offer.equipment));
    meta.appendChild(metaItem('event', Portal.date(offer.start_date) + ' – ' + Portal.date(offer.end_date)));
    meta.appendChild(metaItem('schedule', offer.duration_days + ' days'));
    card.appendChild(meta);

    var budget = Portal.element('p', 'record-meta');
    budget.appendChild(Portal.element('span', 'record-amount', Portal.money(offer.budget_lkr)));
    budget.appendChild(Portal.element('span', null, 'Posted ' + Portal.date(offer.posted_at)));
    card.appendChild(budget);

    if (offer.my_bid_amount_lkr !== null) {
      var mine = Portal.element('p', 'record-meta');
      mine.appendChild(metaItem('gavel', 'Your bid: ' + Portal.money(offer.my_bid_amount_lkr)));
      card.appendChild(mine);
    }

    // Only an open offer the worker hasn't bid on yet can still be acted on;
    // the rest are history (or waiting on the customer).
    if (offer.status === 'open' && offer.my_bid_amount_lkr === null) {
      var actions = Portal.element('div', 'record-actions');
      actions.appendChild(Portal.button('Place bid', 'btn-primary btn-sm', function () {
        openBidModal(offer);
      }));
      actions.appendChild(Portal.button('Not interested', 'btn-outline btn-sm', function () {
        decline(offer);
      }));
      card.appendChild(actions);
    }

    return card;
  }

  function bidCard(bid) {
    var card = cardShell(bid, 'bid');

    var meta = Portal.element('p', 'record-meta');
    meta.appendChild(metaItem('location_on', bid.district));
    meta.appendChild(metaItem('precision_manufacturing', bid.equipment));
    meta.appendChild(metaItem('event', 'Submitted ' + Portal.date(bid.submitted_at)));
    card.appendChild(meta);

    var amount = Portal.element('p', 'record-meta');
    amount.appendChild(Portal.element('span', 'record-amount', Portal.money(bid.bid_amount_lkr)));
    amount.appendChild(Portal.element('span', null, 'for the whole job · customer’s price ' + Portal.money(bid.budget_lkr)));
    card.appendChild(amount);

    if (bid.message) {
      card.appendChild(Portal.element('p', 'record-ref', bid.message));
    }
    return card;
  }

  function metaItem(iconName, text) {
    var span = Portal.element('span');
    span.appendChild(Portal.icon(iconName));
    span.appendChild(document.createTextNode(text));
    return span;
  }

  // ---------- Decline ----------
  function decline(offer) {
    EquipifyApi.post('/freelancer/job-offers/' + offer.offer_id + '/decline').then(function (res) {
      if (!res.ok) {
        window.showToast(res.error);
        return;
      }
      window.showToast('You declined ' + offer.job_ref + '.');
      // Re-fetch rather than patch the card: the row's status is the server's
      // to decide, and this is how the page will behave against real data.
      list.reload();
    });
  }

  // ---------- Bidding ----------
  var bidForm = document.getElementById('bidForm');
  var bidError = document.getElementById('bidFormError');
  var bidSubmit = bidForm.querySelector('button[type="submit"]');
  var bidOffer = null;

  function openBidModal(offer) {
    bidOffer = offer;
    bidError.hidden = true;
    bidForm.reset();
    document.getElementById('bidJobSummary').textContent =
      offer.title + ' · ' + offer.job_ref + ' · ' + offer.customer_name;
    document.getElementById('bidBudget').value = Portal.money(offer.budget_lkr);
    Portal.openModal('bidModal');
    document.getElementById('bidAmount').focus();
  }

  bidForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!bidOffer) return;

    bidError.hidden = true;
    if (!bidForm.checkValidity()) {
      bidForm.reportValidity();
      return;
    }
    bidSubmit.disabled = true;

    EquipifyApi.post('/freelancer/bids', {
      offer_id: bidOffer.offer_id,
      bid_amount_lkr: bidForm.elements.bid_amount_lkr.value,
      message: bidForm.elements.message.value
    }).then(function (res) {
      bidSubmit.disabled = false;
      if (!res.ok) {
        Portal.showFormError(bidError, res);
        return;
      }
      window.showToast(bidForm.dataset.successMessage);
      Portal.closeModal(bidForm.closest('.modal-backdrop'));
      bidForm.reset();
      list.reload();
    });
  });
})();
