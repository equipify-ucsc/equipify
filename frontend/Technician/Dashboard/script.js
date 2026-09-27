/* ==========================================================================
   Equipify — Technician / Dashboard

   The booked appointments, from GET /appointments. Searching, filtering and
   paging are all query params handled by the server (see shared/list.js), so
   picking "On Hold" narrows every appointment you have, not just the ones on
   the page in front of you — which is what the previous client-side tab
   filtering got wrong once there was more than one page of them.

   Changing an appointment's status PUTs it and re-fetches, rather than only
   recolouring the badge, so what you see is what the server has.

   There is no appointments table yet; the rows come from
   backend/fixtures/appointments.json. The page only ever sees the API.
   ========================================================================== */

(function () {
  'use strict';

  /** Stored status -> its badge modifier and label. */
  var STATUS = {
    active:      { label: 'Active',      badge: 'active' },
    in_progress: { label: 'In Progress', badge: 'pending' },
    on_hold:     { label: 'On Hold',     badge: 'draft' },
    completed:   { label: 'Completed',   badge: 'completed' }
  };

  var grid = document.getElementById('job-grid');
  if (!grid) return;

  var list = EquipifyList.create({
    endpoint: '/appointments',
    container: grid,
    pager: document.getElementById('jobPager'),
    countLabel: document.getElementById('jobCount'),
    // The sort <select> rides in `filters`, so changing it also returns to
    // page 1 -- same as the search box and the other filter controls.
    filters: { sort: document.getElementById('jobSort') },
    perPage: 8,
    emptyMessage: 'No appointments match this filter.',
    renderItem: appointmentCard
  });

  // ---------- Filter tabs ----------
  // Each tab sets the `status` param and restarts at page 1; "All" clears it.
  var tabs = document.querySelectorAll('.filter-tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (other) {
        var active = other === tab;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      var status = tab.getAttribute('data-filter');
      list.setParam('status', status === 'all' ? '' : status);
    });
  });

  // ---------- Cards ----------
  function appointmentCard(appointment) {
    var status = STATUS[appointment.status] || { label: appointment.status, badge: 'draft' };

    var card = element('div', 'card job-card');
    card.setAttribute('data-job-id', appointment.appointment_id);
    card.setAttribute('data-status', appointment.status);

    var head = element('div', 'job-card-head');

    var thumb = element('div', 'job-thumb');
    thumb.appendChild(icon(appointment.icon || 'build'));
    head.appendChild(thumb);

    var titles = document.createElement('div');
    titles.appendChild(element('h3', 'type-headline-sm job-title',
      appointment.equipment + ' – ' + appointment.service_type));
    titles.appendChild(element('p', 'type-body-sm job-subtitle', appointment.site));
    head.appendChild(titles);

    head.appendChild(badge(status));
    card.appendChild(head);

    var details = element('div', 'job-detail-grid');
    details.appendChild(detail('Reference', appointment.reference));
    details.appendChild(detail('Scheduled', formatDate(appointment.scheduled_on)));
    details.appendChild(detail('Customer', appointment.customer));
    details.appendChild(detail('Site', appointment.site));
    card.appendChild(details);

    card.appendChild(statusEditor(appointment));
    return card;
  }

  /** The "Update Status" select. Saves to the server, then reloads the list. */
  function statusEditor(appointment) {
    var wrap = element('div', 'job-footer');

    var id = 'status-' + appointment.appointment_id;
    var label = element('label', 'status-label', 'Update Status');
    label.setAttribute('for', id);
    wrap.appendChild(label);

    var select = document.createElement('select');
    select.className = 'status-select';
    select.id = id;
    Object.keys(STATUS).forEach(function (value) {
      var option = new Option(STATUS[value].label, value);
      option.selected = value === appointment.status;
      select.appendChild(option);
    });

    select.addEventListener('change', function () {
      select.disabled = true;
      EquipifyApi.put('/appointments/' + appointment.appointment_id + '/status', { status: select.value })
        .then(function (res) {
          select.disabled = false;
          if (!res.ok) {
            toast(res.error);
            select.value = appointment.status;
            return;
          }
          toast(appointment.reference + ' is now ' + (STATUS[res.data.status] || {}).label + '.');
          // Re-fetch rather than patch the card: if a filter is active the row
          // may no longer belong on this page at all.
          list.reload();
        });
    });

    wrap.appendChild(select);
    return wrap;
  }

  // ---------- Small builders ----------
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(name) {
    var span = element('span', 'icon', name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function badge(status) {
    var span = element('span', 'badge-status badge-status--' + status.badge);
    var dot = element('span', 'badge-status__dot');
    dot.setAttribute('aria-hidden', 'true');
    span.appendChild(dot);
    span.appendChild(document.createTextNode(' ' + status.label));
    return span;
  }

  function detail(label, value) {
    var cell = element('div', 'detail-cell');
    cell.appendChild(element('div', 'detail-cell-label', label));
    cell.appendChild(element('div', 'detail-cell-value', value || '—'));
    return cell;
  }

  /** "2026-09-27" -> "27 Sep 2026". */
  function formatDate(value) {
    if (!value) return '—';
    var parsed = new Date(String(value).replace(' ', 'T'));
    if (isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  var toastTimer;
  function toast(message) {
    var box = document.getElementById('toast');
    if (!box) return;
    box.textContent = message;
    box.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.classList.remove('is-visible'); }, 2600);
  }
})();
