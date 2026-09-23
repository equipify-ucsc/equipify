/* ==========================================================================
   Equipify — Freelance Worker / Job History

   GET /freelancer/jobs, paged and filtered on the server (search, status, and
   a start/end date range). The jobs table doesn't exist in the schema yet, so
   the endpoint serves placeholder rows in the shape the real query will return.

   A completed job can be rated once: the star modal posts to
   /freelancer/jobs/{id}/rating, which is the operator's half of
   customers.freelancer_avg_rating in 004_create_customers.sql.
   ========================================================================== */

(function () {
  'use strict';

  var list = EquipifyList.create({
    endpoint: '/freelancer/jobs',
    container: document.querySelector('#jobTable tbody'),
    searchInput: document.getElementById('jobSearch'),
    filters: {
      status: document.getElementById('statusFilter'),
      from: document.getElementById('fromFilter'),
      to: document.getElementById('toFilter')
    },
    pager: document.getElementById('jobPager'),
    countLabel: document.getElementById('jobCount'),
    columns: 6,
    emptyMessage: 'No jobs match these filters.',
    renderItem: jobRow
  });

  // The date inputs fire `change` on every keystroke in some browsers, which
  // the shared list already debounces only for the search box; a date is
  // cheap enough to refetch on, and resetting to page 1 keeps it correct.

  function jobRow(job) {
    var tr = document.createElement('tr');

    var jobCell = document.createElement('td');
    jobCell.appendChild(Portal.element('strong', null, job.title));
    jobCell.appendChild(Portal.element('div', 'cell-muted', job.job_ref + ' · ' + job.equipment));
    tr.appendChild(jobCell);

    tr.appendChild(Portal.cell(job.customer_name + ' · ' + job.district));
    tr.appendChild(Portal.cell(
      Portal.date(job.start_date) + ' – ' + Portal.date(job.end_date),
      { className: 'cell-muted' }
    ));
    tr.appendChild(Portal.cellWith(Portal.badge('job', job.status)));
    tr.appendChild(Portal.cell(job.status === 'cancelled' ? '—' : Portal.money(job.earnings_lkr)));
    tr.appendChild(ratingCell(job));

    return tr;
  }

  function ratingCell(job) {
    // Already rated: show the stars. Completed but unrated: offer the modal.
    // Anything else can't be rated yet.
    if (job.customer_rating_given) {
      return Portal.cellWith(Portal.stars(job.customer_rating_given));
    }
    if (job.status !== 'completed') {
      return Portal.cell('—', { className: 'cell-muted' });
    }
    return Portal.cellWith(Portal.button('Rate customer', 'btn-outline btn-sm', function () {
      openRatingModal(job);
    }));
  }

  // ---------- Rating modal ----------
  var ratingForm = document.getElementById('ratingForm');
  var ratingError = document.getElementById('ratingFormError');
  var ratingSubmit = ratingForm.querySelector('button[type="submit"]');
  var picker = document.getElementById('starPicker');
  var ratingJob = null;
  var chosenRating = 0;

  // Five radio-style star buttons, built once.
  for (var value = 1; value <= 5; value++) {
    picker.appendChild(starButton(value));
  }

  function starButton(value) {
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.setAttribute('aria-label', value + (value === 1 ? ' star' : ' stars'));
    button.appendChild(Portal.icon('star', 'icon'));
    button.addEventListener('click', function () { setRating(value); });
    return button;
  }

  function setRating(value) {
    chosenRating = value;
    Array.prototype.forEach.call(picker.children, function (button, index) {
      var on = index < value;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-checked', index === value - 1 ? 'true' : 'false');
    });
  }

  function openRatingModal(job) {
    ratingJob = job;
    ratingError.hidden = true;
    setRating(0);
    document.getElementById('ratingComment').value = '';
    document.getElementById('ratingJobSummary').textContent =
      job.customer_name + ' · ' + job.job_ref + ' · finished ' + Portal.date(job.end_date);
    Portal.openModal('ratingModal');
  }

  ratingForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!ratingJob) return;

    if (chosenRating === 0) {
      ratingError.textContent = 'Pick a rating from 1 to 5 stars.';
      ratingError.hidden = false;
      return;
    }
    ratingError.hidden = true;
    ratingSubmit.disabled = true;

    EquipifyApi.post('/freelancer/jobs/' + ratingJob.job_id + '/rating', {
      rating: chosenRating,
      comment: document.getElementById('ratingComment').value
    }).then(function (res) {
      ratingSubmit.disabled = false;
      if (!res.ok) {
        Portal.showFormError(ratingError, res);
        return;
      }
      window.showToast(ratingForm.dataset.successMessage);
      Portal.closeModal(ratingForm.closest('.modal-backdrop'));
      list.reload();
    });
  });
})();
