/* ==========================================================================
   Equipify — Customer Rental History
   Status filter tabs, live request deadlines and the cancel-request dialog
   (vanilla JS, no dependencies). Mobile navigation drawer behavior lives in
   ../../shared/script.js; deadline rules in ../../shared/rental-timing.js.

   UI only for now: the cards are mock data, and cancelling or expiring a
   request only changes the page. The rentals module will load the real list.
   ========================================================================== */

(function () {
  'use strict';

  var Timing = window.EquipifyRentalTiming;
  var tabs = document.querySelectorAll('.filter-tab');
  var grid = document.getElementById('rental-history-grid');
  var noResults = document.getElementById('rental-history-no-results');
  var countLabel = document.getElementById('rental-history-count');

  if (!tabs.length || !grid) return;

  var activeFilter = 'all';

  /* ---- Status filter tabs ---- */

  function applyFilter() {
    var visibleCount = 0;

    grid.querySelectorAll('.entity-card').forEach(function (card) {
      var isMatch = activeFilter === 'all' || card.getAttribute('data-status') === activeFilter;
      card.hidden = !isMatch;
      if (isMatch) visibleCount += 1;
    });

    if (noResults) {
      noResults.hidden = visibleCount !== 0;
    }
  }

  function updateCount() {
    var total = grid.querySelectorAll('.entity-card').length;
    if (countLabel) countLabel.textContent = total + (total === 1 ? ' rental' : ' rentals');
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      activeFilter = tab.getAttribute('data-filter');
      applyFilter();
    });
  });

  /* ---- Moving a request to Cancelled ---- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(name) {
    var span = el('span', 'icon icon-sm', name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function markCancelled(card, reason, iconName) {
    card.setAttribute('data-status', 'cancelled');

    var badge = card.querySelector('.badge-status');
    badge.className = 'badge-status badge-status--rejected';
    badge.textContent = '';
    var dot = el('span', 'badge-status__dot');
    dot.setAttribute('aria-hidden', 'true');
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(' Cancelled'));

    var note = card.querySelector('.deadline-note');
    var reasonLine = el('p', 'entity-reason');
    reasonLine.appendChild(icon(iconName));
    reasonLine.appendChild(document.createTextNode(' ' + reason));
    if (note) {
      note.replaceWith(reasonLine);
    } else {
      card.querySelector('.entity-card-head').after(reasonLine);
    }

    var footer = card.querySelector('.entity-footer');
    footer.textContent = '';
    var browse = el('a', 'btn-outline', 'Find Similar');
    browse.href = '../Browsing page/index.html';
    footer.appendChild(browse);

    applyFilter();
  }

  /* ---- Live deadlines ---- */

  Timing.resolveMockDeadlines(grid);
  Timing.startCountdowns(grid, function (note) {
    var card = note.closest('.entity-card');
    if (!card || card.getAttribute('data-status') === 'cancelled') return;
    markCancelled(card, card.getAttribute('data-expire-reason') || 'Expired', 'timer_off');
  });

  /* ---- Cancel request dialog ---- */

  var cancelModal = document.getElementById('cancelModal');
  var cancelItem = document.getElementById('cancelModalItem');
  var cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
  var pendingCancel = null;
  var lastTrigger = null;

  function openModal(modal) {
    modal.classList.add('is-open');
    var focusTarget = modal.querySelector('.btn-outline, button');
    if (focusTarget) focusTarget.focus();
  }

  function closeModal(modal) {
    modal.classList.remove('is-open');
    if (lastTrigger && document.body.contains(lastTrigger)) lastTrigger.focus();
  }

  grid.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-action="cancel"]');
    if (!trigger) return;
    pendingCancel = trigger.closest('.entity-card');
    lastTrigger = trigger;
    cancelItem.textContent = pendingCancel.querySelector('.entity-title').textContent;
    openModal(cancelModal);
  });

  cancelConfirmBtn.addEventListener('click', function () {
    if (pendingCancel) {
      // Placeholder: the rentals module will PATCH /rentals/{id}/cancel here.
      markCancelled(pendingCancel, 'Cancelled by you', 'cancel');
      lastTrigger = pendingCancel.querySelector('.entity-footer a');
      pendingCancel = null;
    }
    closeModal(cancelModal);
  });

  document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeModal(btn.closest('.modal-backdrop')); });
  });
  cancelModal.addEventListener('click', function (event) {
    if (event.target === cancelModal) closeModal(cancelModal);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && cancelModal.classList.contains('is-open')) closeModal(cancelModal);
  });

  updateCount();
  applyFilter();
})();
