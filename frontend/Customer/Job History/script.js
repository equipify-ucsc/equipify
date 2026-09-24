/* ==========================================================================
   Equipify — Customer Job History
   The customer's fixed-price job offers for freelance workers: post, edit,
   publish, remove, compare bids, hire and mark done (vanilla JS, no
   dependencies; needs shared/api.js).

   The list is whatever GET /customer/jobs returns for the signed-in customer.
   What each card offers comes from the server: `can_edit` says whether the
   job's terms can still change (a draft, or an open job nobody has bid on),
   and removing a job answers with whether it was deleted (a draft) or
   cancelled (an open job, which stays in history).
   ========================================================================== */

(function () {
  'use strict';

  // ---------- Toast ----------
  var toastTimer;
  function showToast(message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2600);
  }

  var grid = document.getElementById('job-history-grid');
  var countLabel = document.getElementById('job-history-count');
  var noResults = document.getElementById('job-history-no-results');
  var loadError = document.getElementById('job-history-error');
  var emptyState = document.getElementById('job-history-empty');
  var tabs = document.querySelectorAll('.filter-tab');
  if (!grid) return;

  // ---------- Status -> label + badge modifier from the design system ----------
  var STATUS = {
    draft:     { label: 'Draft',     badge: 'draft' },
    open:      { label: 'Open',      badge: 'pending' },
    hired:     { label: 'Hired',     badge: 'active' },
    completed: { label: 'Completed', badge: 'completed' },
    cancelled: { label: 'Cancelled', badge: 'rejected' }
  };

  var BID_STATUS = {
    submitted:   { label: 'Pending',     badge: 'pending' },
    shortlisted: { label: 'Shortlisted', badge: 'pending' },
    won:         { label: 'Hired',       badge: 'active' },
    lost:        { label: 'Not chosen',  badge: 'draft' }
  };

  // ---------- Formatting ----------
  /** 45000 -> "Rs 45,000.00" (the format the freelancer portal uses). */
  function money(amount) {
    return 'Rs ' + Number(amount).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /** "2026-10-01" or "2026-10-01 09:30:00" -> "Oct 01, 2026". */
  function formatDate(value) {
    if (!value) return '';
    var parsed = new Date(String(value).replace(' ', 'T'));
    if (isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  /** Today as YYYY-MM-DD in the browser's time zone, for the date inputs' min. */
  function todayIso() {
    var now = new Date();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
  }

  // ---------- Small DOM builders ----------
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

  function badge(meta) {
    var span = el('span', 'badge-status badge-status--' + meta.badge);
    var dot = el('span', 'badge-status__dot');
    dot.setAttribute('aria-hidden', 'true');
    span.appendChild(dot);
    span.appendChild(document.createTextNode(' ' + meta.label));
    return span;
  }

  function metaRow(iconName, text) {
    var row = el('div', 'entity-meta-row');
    row.appendChild(icon(iconName));
    row.appendChild(el('span', 'type-body-sm', text));
    return row;
  }

  function button(label, className, onClick, disabledReason) {
    var btn = el('button', className, label);
    btn.type = 'button';
    if (disabledReason) {
      btn.disabled = true;
      btn.title = disabledReason;
    } else {
      btn.addEventListener('click', onClick);
    }
    return btn;
  }

  // ---------- Cards ----------
  function jobCard(job) {
    var meta = STATUS[job.status] || { label: job.status, badge: 'draft' };

    var card = el('article', 'card card--hover entity-card');
    card.setAttribute('data-status', job.status);

    var head = el('div', 'entity-card-head');
    var main = el('div', 'entity-card-main');
    var titles = el('div');
    titles.appendChild(el('span', 'badge-label', job.equipment));
    titles.appendChild(el('h3', 'type-headline-sm entity-title', job.title));
    titles.appendChild(el('p', 'entity-ref', job.job_ref + ' · ' + job.site + ', ' + job.district));
    main.appendChild(titles);
    head.appendChild(main);
    head.appendChild(badge(meta));
    card.appendChild(head);

    card.appendChild(metaRow('payments', money(job.budget_lkr) + ' fixed price'));
    card.appendChild(metaRow('event', formatDate(job.start_date) + ' – ' + formatDate(job.end_date) +
      ' (' + job.duration_days + (job.duration_days === 1 ? ' day)' : ' days)')));

    switch (job.status) {
      case 'draft':
        card.appendChild(metaRow('visibility_off', 'Not yet published'));
        break;
      case 'open':
        card.appendChild(metaRow('calendar_today', 'Posted ' + formatDate(job.published_at)));
        card.appendChild(metaRow('groups', job.bid_count === 1 ? '1 bid' : job.bid_count + ' bids'));
        break;
      case 'hired':
        card.appendChild(metaRow('person', 'Hired: ' + job.hired_worker_name));
        break;
      case 'completed':
        card.appendChild(metaRow('task_alt', 'Completed by ' + job.hired_worker_name +
          ' on ' + formatDate(job.completed_at)));
        break;
      case 'cancelled':
        card.appendChild(metaRow('cancel', 'Cancelled ' + formatDate(job.cancelled_at)));
        break;
    }

    card.appendChild(cardActions(job));
    return card;
  }

  function cardActions(job) {
    var footer = el('div', 'entity-footer');
    var lockedReason = 'Workers have already bid on this job, so its details are fixed.';

    if (job.status === 'draft') {
      footer.appendChild(button('Publish Job', 'btn-solid', function () { publishJob(job); }));
      footer.appendChild(button('Edit', 'link-action', function () { openJobModal(job); }));
      footer.appendChild(button('Delete', 'link-action link-action--danger', function () { removeJob(job); }));
    } else if (job.status === 'open') {
      footer.appendChild(button(
        'View Bids (' + job.bid_count + ')',
        'btn-outline',
        function () { openBidsModal(job); },
        job.bid_count === 0 ? 'No bids yet' : ''
      ));
      footer.appendChild(button('Edit', 'link-action', function () { openJobModal(job); },
        job.can_edit ? '' : lockedReason));
      footer.appendChild(button('Cancel Job', 'link-action link-action--danger', function () { removeJob(job); }));
    } else if (job.status === 'hired') {
      footer.appendChild(button('Mark Completed', 'btn-solid', function () { completeJob(job); }));
      footer.appendChild(button('View Bids', 'link-action', function () { openBidsModal(job); }));
    } else if (job.bid_count > 0) {
      footer.appendChild(button('View Bids', 'btn-outline', function () { openBidsModal(job); }));
    }
    return footer;
  }

  // ---------- List + filter tabs ----------
  var jobs = [];
  var activeFilter = 'all';

  function applyFilter() {
    var visibleCount = 0;
    grid.querySelectorAll('.entity-card').forEach(function (card) {
      var isMatch = activeFilter === 'all' || card.getAttribute('data-status') === activeFilter;
      card.hidden = !isMatch;
      if (isMatch) visibleCount += 1;
    });
    noResults.hidden = jobs.length === 0 || visibleCount !== 0;
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

  function renderJobs(list) {
    jobs = list;
    grid.textContent = '';
    loadError.hidden = true;
    countLabel.textContent = list.length === 1 ? '1 job posted' : list.length + ' jobs posted';
    emptyState.hidden = list.length !== 0;
    list.forEach(function (job) {
      grid.appendChild(jobCard(job));
    });
    applyFilter();
  }

  function loadJobs() {
    return EquipifyApi.get('/customer/jobs').then(function (res) {
      if (!res.ok) {
        grid.textContent = '';
        countLabel.textContent = '';
        loadError.textContent = res.error;
        loadError.hidden = false;
        return;
      }
      renderJobs(res.data);
    });
  }

  // ---------- Modals ----------
  function openModal(modal) {
    modal.classList.add('is-open');
  }

  function closeModal(modal) {
    modal.classList.remove('is-open');
  }

  document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeModal(btn.closest('.modal-backdrop')); });
  });
  document.querySelectorAll('.modal-backdrop').forEach(function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal(modal);
    });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.modal-backdrop.is-open').forEach(closeModal);
  });

  /** The API's per-field messages ({fields: {...}}) in the form's one error line. */
  function showFormError(errorEl, res) {
    var details = Object.keys(res.fields || {}).map(function (key) { return res.fields[key]; });
    errorEl.textContent = details.length ? details.join(' ') : res.error;
    errorEl.hidden = false;
  }

  // ---------- Post / edit job ----------
  var jobModal = document.getElementById('jobModal');
  var jobModalTitle = document.getElementById('jobModalTitle');
  var jobForm = document.getElementById('jobForm');
  var jobFormError = document.getElementById('jobFormError');
  var saveDraftBtn = document.getElementById('jobSaveDraftBtn');
  var submitBtn = document.getElementById('jobSubmitBtn');
  var fields = jobForm.elements;

  var editing = null; // the job being edited, or null when posting a new one

  function openJobModal(job) {
    editing = job || null;
    jobForm.reset();
    jobFormError.hidden = true;

    var today = todayIso();
    fields.start_date.min = today;
    fields.end_date.min = today;

    if (editing) {
      fields.title.value = editing.title;
      fields.equipment.value = editing.equipment;
      fields.budget_lkr.value = editing.budget_lkr.toFixed(2);
      fields.district.value = editing.district;
      fields.site.value = editing.site;
      fields.start_date.value = editing.start_date;
      fields.end_date.value = editing.end_date;
      fields.description.value = editing.description || '';
      jobModalTitle.textContent = 'Edit ' + editing.job_ref;
    } else {
      jobModalTitle.textContent = 'Post a Job';
    }

    // A new job or a draft can be saved as a draft or published; an open job
    // is already published, so it only has "Save changes".
    var isOpenJob = editing !== null && editing.status === 'open';
    saveDraftBtn.hidden = isOpenJob;
    submitBtn.textContent = isOpenJob ? 'Save changes' : (editing ? 'Save & publish' : 'Publish job');
    saveDraftBtn.textContent = editing ? 'Save draft' : 'Save as draft';

    openModal(jobModal);
    fields.title.focus();
  }

  document.getElementById('postJobBtn').addEventListener('click', function () { openJobModal(null); });
  document.getElementById('emptyPostJobBtn').addEventListener('click', function () { openJobModal(null); });

  // The end date can't be before the start date; keep the picker in step.
  fields.start_date.addEventListener('change', function () {
    fields.end_date.min = fields.start_date.value || todayIso();
  });

  jobForm.addEventListener('submit', function (event) {
    event.preventDefault();
    jobFormError.hidden = true;
    if (!jobForm.checkValidity()) {
      jobForm.reportValidity();
      return;
    }

    var publish = event.submitter ? event.submitter.getAttribute('data-publish') === 'true' : true;
    var body = {
      title: fields.title.value,
      equipment: fields.equipment.value,
      budget_lkr: fields.budget_lkr.value,
      district: fields.district.value,
      site: fields.site.value,
      start_date: fields.start_date.value,
      end_date: fields.end_date.value,
      description: fields.description.value
    };

    var request;
    if (editing === null) {
      body.publish = publish;
      request = EquipifyApi.post('/customer/jobs', body);
    } else {
      var jobId = editing.job_id;
      var wasDraft = editing.status === 'draft';
      request = EquipifyApi.put('/customer/jobs/' + jobId, body).then(function (res) {
        // "Save & publish" on a draft is a save followed by a publish.
        if (!res.ok || !(wasDraft && publish)) return res;
        return EquipifyApi.post('/customer/jobs/' + jobId + '/publish');
      });
    }

    saveDraftBtn.disabled = true;
    submitBtn.disabled = true;
    request.then(function (res) {
      saveDraftBtn.disabled = false;
      submitBtn.disabled = false;
      if (!res.ok) {
        showFormError(jobFormError, res);
        return;
      }
      var wasOpen = editing !== null && editing.status === 'open';
      if (wasOpen) {
        showToast('Changes to ' + res.data.job_ref + ' saved.');
      } else if (res.data.status === 'open') {
        showToast(res.data.job_ref + ' is published. Workers can now bid on it.');
      } else {
        showToast(res.data.job_ref + ' saved as a draft.');
      }
      closeModal(jobModal);
      editing = null;
      loadJobs();
    });
  });

  // ---------- Publish / remove / complete ----------
  function publishJob(job) {
    EquipifyApi.post('/customer/jobs/' + job.job_id + '/publish').then(function (res) {
      if (!res.ok) {
        var details = Object.keys(res.fields).map(function (k) { return res.fields[k]; });
        showToast(details.length ? details.join(' ') : res.error);
        return;
      }
      showToast(job.job_ref + ' is published. Workers can now bid on it.');
      loadJobs();
    });
  }

  function removeJob(job) {
    var question = job.status === 'draft'
      ? 'Delete the draft "' + job.title + '"? This cannot be undone.'
      : 'Cancel "' + job.title + '"?\n\nWorkers will no longer be able to bid, and any bids placed will be declined. ' +
        'The job stays in your history as Cancelled.';
    if (!window.confirm(question)) return;

    EquipifyApi.del('/customer/jobs/' + job.job_id).then(function (res) {
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      showToast(res.data.outcome === 'cancelled'
        ? job.job_ref + ' was cancelled.'
        : 'Draft ' + job.job_ref + ' deleted.');
      loadJobs();
    });
  }

  function completeJob(job) {
    if (!window.confirm('Mark "' + job.title + '" as completed by ' + job.hired_worker_name + '?')) return;

    EquipifyApi.post('/customer/jobs/' + job.job_id + '/complete').then(function (res) {
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      showToast(job.job_ref + ' marked as completed.');
      loadJobs();
    });
  }

  // ---------- Bids ----------
  var bidsModal = document.getElementById('bidsModal');
  var bidList = document.getElementById('bidList');

  function openBidsModal(job) {
    document.getElementById('bidsModalTitle').textContent = 'Bids for ' + job.title;
    document.getElementById('bidsModalSummary').textContent =
      job.job_ref + ' · Your fixed price: ' + money(job.budget_lkr);
    bidList.textContent = '';
    bidList.appendChild(el('p', 'bid-list__state', 'Loading bids…'));
    openModal(bidsModal);

    EquipifyApi.get('/customer/jobs/' + job.job_id + '/bids').then(function (res) {
      bidList.textContent = '';
      if (!res.ok) {
        bidList.appendChild(el('p', 'bid-list__state', res.error));
        return;
      }
      if (res.data.length === 0) {
        bidList.appendChild(el('p', 'bid-list__state', 'No bids yet.'));
        return;
      }
      res.data.forEach(function (bid) {
        bidList.appendChild(bidRow(job, bid));
      });
    });
  }

  function bidRow(job, bid) {
    var row = el('div', 'bid-row');

    var info = el('div', 'bid-row__info');
    var name = el('p', 'bid-row__name', bid.worker_name);
    if (bid.verified) {
      var verified = icon('verified');
      verified.classList.add('bid-row__verified');
      verified.setAttribute('aria-hidden', 'false');
      verified.setAttribute('aria-label', 'Verified');
      verified.title = 'Credentials verified';
      name.appendChild(verified);
    }
    info.appendChild(name);

    var facts = [];
    facts.push(bid.rating_count > 0
      ? bid.avg_rating.toFixed(1) + ' ★ (' + bid.rating_count + ')'
      : 'Not rated yet');
    if (bid.years_experience !== null) {
      facts.push(bid.years_experience + (bid.years_experience === 1 ? ' year' : ' years') + ' experience');
    }
    if (bid.worker_district) facts.push(bid.worker_district);
    facts.push('Bid ' + formatDate(bid.submitted_at));
    info.appendChild(el('p', 'bid-row__facts', facts.join(' · ')));
    if (bid.message) info.appendChild(el('p', 'bid-row__message', bid.message));
    row.appendChild(info);

    var side = el('div', 'bid-row__side');
    side.appendChild(el('p', 'bid-row__amount', money(bid.bid_amount_lkr)));
    if (job.status === 'open' && (bid.status === 'submitted' || bid.status === 'shortlisted')) {
      side.appendChild(button('Hire', 'btn-primary btn-sm', function () { hire(job, bid); }));
    } else {
      side.appendChild(badge(BID_STATUS[bid.status] || { label: bid.status, badge: 'draft' }));
    }
    row.appendChild(side);
    return row;
  }

  function hire(job, bid) {
    var question = 'Hire ' + bid.worker_name + ' for ' + money(bid.bid_amount_lkr) + '?\n\n' +
      'The job closes to new bids and every other bid is declined.';
    if (!window.confirm(question)) return;

    EquipifyApi.post('/customer/jobs/' + job.job_id + '/hire', { bid_id: bid.bid_id }).then(function (res) {
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      closeModal(bidsModal);
      showToast(bid.worker_name + ' is hired for ' + job.job_ref + '.');
      loadJobs();
    });
  }

  loadJobs();
})();
