/* ==========================================================================
   Equipify — Customer Profile
   Page-specific behavior (vanilla JS, needs shared/api.js)
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
