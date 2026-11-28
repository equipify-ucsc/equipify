(function () {
  'use strict';
  var list = document.querySelector('.assignment-list'), page = 1, status = '', busy = false, generation = 0, stopped = false;
  var previous = document.getElementById('deliveryPrevious'), next = document.getElementById('deliveryNext');
  var pageLabel = document.getElementById('deliveryPage'), summary = document.getElementById('deliverySummary');
  var refresh = document.getElementById('refreshBtn'), filters = document.querySelectorAll('.filter-tab');
  var assignmentSupported = false, dialog = null, dialogEpoch = 0, notice = null, serverTime = '';
  var statuses = {
    pending: 'Pending', assigned: 'Assigned', in_transit: 'In transit', delivered: 'Delivered', cancelled: 'Cancelled'
  };
  function element(tag, className, text) {
    var node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(name) {
    var paths = {
      truck: 'M3 6h11v11H3zM14 10h4l3 4v3h-7M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4m11 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
      pickup: 'M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12ZM9 9h6m-3-3v6',
      dropoff: 'M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12Zm-3-12 2 2 4-4',
      calendar: 'M4 5h16v16H4zM4 10h16M8 3v4m8-4v4',
      empty: 'M4 5h16v14H4zM4 13h4l2 3h4l2-3h4',
      error: 'M12 3 2 21h20L12 3ZM12 9v5m0 3v1'
    };
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[name]);
    svg.append(path); return svg;
  }
  function active() { return !stopped && !document.hidden && document.contains(list); }
  function clear() {
    closeDialog();
    if (notice) { notice.remove(); notice = null; }
    generation++; busy = false; list.replaceChildren(); list.setAttribute('aria-busy', 'false');
    previous.disabled = next.disabled = true;
    if (refresh) refresh.disabled = true;
    if (pageLabel) pageLabel.textContent = '';
    if (summary) summary.textContent = '';
  }
  function stop() { stopped = true; clear(); }
  EquipifyApi.onSessionChange(stop);
  document.addEventListener('visibilitychange', function () { clear(); if (active()) load(page); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', function (event) { if (event.persisted) window.location.reload(); });

  function setFilter(value) {
    if (busy || !active()) return;
    status = value;
    filters.forEach(function (tab) {
      var selected = tab.dataset.filter === (value || 'all');
      tab.classList.toggle('is-active', selected); tab.setAttribute('aria-pressed', String(selected));
    });
    return load(1);
  }
  function showState(kind, heading, message) {
    var row = element('li', 'delivery-state delivery-state--' + kind);
    row.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    var symbol = element('span', kind === 'loading' ? 'delivery-spinner' : 'delivery-state-icon');
    symbol.setAttribute('aria-hidden', 'true');
    if (kind !== 'loading') symbol.append(icon(kind === 'error' ? 'error' : 'empty'));
    row.append(symbol, element('h2', 'delivery-state-title', heading), element('p', 'delivery-state-description', message));
    if (kind === 'error' || (kind === 'empty' && status)) {
      var retry = element('button', 'delivery-state-button', kind === 'error' ? 'Try again' : 'View all deliveries');
      retry.type = 'button'; retry.onclick = function () { return kind === 'error' ? load(page) : setFilter(''); };
      row.append(retry);
    }
    list.replaceChildren(row);
  }
  function locationBlock(label, address, kind) {
    var block = element('div', 'delivery-location'), symbol = element('span', 'delivery-location-icon delivery-location-icon--' + kind);
    symbol.append(icon(kind));
    var text = element('div', 'delivery-location-text');
    text.append(element('p', 'delivery-label', label), element('p', 'delivery-address', address || 'Address not provided'));
    block.append(symbol, text); return block;
  }
  function deliveryCard(delivery) {
    var card = element('li', 'delivery-card'), header = element('div', 'delivery-card-header');
    var identity = element('div', 'delivery-identity'), symbol = element('span', 'delivery-truck');
    symbol.append(icon('truck'));
    var titles = element('div', 'delivery-titles');
    titles.append(element('h2', 'delivery-title', 'Delivery #' + delivery.delivery_id));
    titles.append(element('p', 'delivery-reference', delivery.related_reference ? 'Reference ' + delivery.related_reference : 'No reference provided'));
    identity.append(symbol, titles);
    var statusKey = Object.prototype.hasOwnProperty.call(statuses, delivery.status) ? delivery.status : 'unknown';
    var badge = element('span', 'delivery-status delivery-status--' + statusKey);
    var dot = element('span', 'delivery-status-dot'); dot.setAttribute('aria-hidden', 'true');
    badge.append(dot, element('span', '', statuses[statusKey] || 'Status unavailable'));
    header.append(identity, badge);
    var route = element('div', 'delivery-route');
    route.append(locationBlock('Pickup location', delivery.pickup_address, 'pickup'), locationBlock('Drop-off location', delivery.delivery_address, 'dropoff'));
    var schedule = element('div', 'delivery-schedule'), calendar = element('span', 'delivery-calendar');
    calendar.append(icon('calendar')); schedule.append(calendar, element('span', 'delivery-schedule-label', 'Scheduled'));
    if (delivery.scheduled_at) {
      var date = new Date(String(delivery.scheduled_at).replace(' ', 'T') + '+05:30'), time = element('time', 'delivery-scheduled-time');
      time.textContent = isNaN(date.getTime()) ? String(delivery.scheduled_at) : date.toLocaleString(undefined, {timeZone: 'Asia/Colombo', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) + ' (Sri Lanka)';
      if (!isNaN(date.getTime())) time.setAttribute('datetime', date.toISOString());
      schedule.append(time);
    } else schedule.append(element('span', 'delivery-unscheduled', 'Not scheduled'));
    card.append(header, route, schedule);
    if (assignmentSupported) {
      var resources = element('div', 'delivery-resources');
      resources.append(element('p', '', 'Personnel: ' + (delivery.delivery_personnel_name || 'Not reserved')));
      resources.append(element('p', '', 'Vehicle: ' + (delivery.vehicle_plate || (delivery.vehicle_id ? '#' + delivery.vehicle_id : 'Not reserved'))));
      if (delivery.scheduled_end_at) resources.append(element('p', '', 'Scheduled end: ' + delivery.scheduled_end_at + ' (Sri Lanka)'));
      if (delivery.status === 'pending') resources.append(element('p', 'delivery-resource-note', delivery.delivery_personnel_id ? 'Personnel reserved · vehicle confirmation pending' : 'Personnel and vehicle confirmation pending'));
      card.append(resources);
      if (delivery.status === 'pending' || delivery.status === 'assigned') {
        var actions = element('div', 'delivery-assignment-actions');
        actions.append(actionButton(delivery.delivery_personnel_id ? 'Reassign / reschedule' : 'Reserve resources', function () { openDialog(delivery, false, this); }));
        actions.append(actionButton('Cancel delivery', function () { openDialog(delivery, true, this); }, 'delivery-action--danger'));
        card.append(actions);
      }
      if (delivery.status === 'assigned' || delivery.status === 'in_transit') {
        var lifecycleActions = element('div', 'delivery-assignment-actions');
        var targetStatus = delivery.status === 'assigned' ? 'in_transit' : 'delivered';
        lifecycleActions.append(actionButton(delivery.status === 'assigned' ? 'Start delivery' : 'Complete delivery', function () { openDialog(delivery, false, this, targetStatus); }));
        card.append(lifecycleActions);
      }
    }
    return card;
  }

  function actionButton(label, handler, extra) {
    var button = element('button', 'delivery-action ' + (extra || ''), label);
    button.type = 'button'; button.onclick = handler; return button;
  }
  function closeDialog() {
    dialogEpoch++;
    if (dialog) { var old = dialog; dialog = null; old.close(); old.remove(); }
  }
  function message(text, error) {
    if (!notice) { notice = element('p', 'delivery-feedback'); list.parentNode.insertBefore(notice, list); }
    notice.className = 'delivery-feedback' + (error ? ' delivery-feedback--error' : '');
    notice.setAttribute('role', error ? 'alert' : 'status'); notice.textContent = text;
  }
  function openDialog(delivery, cancelling, opener, lifecycle) {
    if (!active()) return;
    closeDialog();
    var epoch = dialogEpoch, pending = false, confirmed = false, lookupEpoch = 0;
    var panel = dialog = element('dialog', 'delivery-assignment-dialog');
    panel.setAttribute('aria-labelledby', 'delivery-assignment-title');
    var heading = element('h2', '', (lifecycle ? 'Update delivery #' : cancelling ? 'Cancel delivery #' : 'Reserve resources for #') + delivery.delivery_id);
    heading.id = 'delivery-assignment-title';
    var description = element('p', 'delivery-dialog-description', lifecycle ? 'Confirm the actual delivery progress. Starting is allowed only during the reserved window. Completion releases resources unless another reservation still needs them.' : cancelling ? 'Cancellation releases personnel and vehicle reservations and retains delivery history.' : 'Choose an explicit start and end in Sri Lanka time. Select a vehicle to assign both resources, or choose personnel only to keep the delivery pending. Choosing no vehicle also releases a previously reserved vehicle.');
    if (lifecycle) description.textContent += ' Reserved: ' + delivery.scheduled_at + ' to ' + delivery.scheduled_end_at + ' (Asia/Colombo, UTC+05:30).' + (serverTime ? ' Server time at last refresh: ' + serverTime + '.' : '');
    var feedback = element('p', 'delivery-dialog-feedback'); feedback.setAttribute('role', 'status');
    var content = element('div', 'delivery-dialog-fields'), footer = element('div', 'delivery-dialog-actions');
    var dismiss = actionButton('Close', function () { closeDialog(); if (active() && document.contains(opener)) opener.focus(); });
    var save = actionButton(lifecycle ? 'Review update' : cancelling ? 'Review cancellation' : 'Review reservation', submit);
    var start, end, select, find, reason, vehicle;
    function field(label, input) { var node = element('label', 'delivery-dialog-field', label); node.append(input); content.append(node); }
    function resetConfirmation() { confirmed = false; save.textContent = lifecycle ? 'Review update' : cancelling ? 'Review cancellation' : 'Review reservation'; feedback.textContent = ''; }
    function alive() { return epoch === dialogEpoch && dialog === panel && active(); }
    function feedbackText(text, error) { feedback.setAttribute('role', error ? 'alert' : 'status'); feedback.textContent = text; }
    if (lifecycle) {
      content.append(element('p', '', 'New status: ' + statuses[lifecycle]));
    } else if (cancelling) {
      reason = element('textarea', ''); reason.rows = 3; reason.maxLength = 500; reason.required = true;
      reason.oninput = resetConfirmation; field('Reason for cancellation', reason);
    } else {
      start = element('input', ''); end = element('input', '');
      start.type = end.type = 'datetime-local'; start.required = end.required = true;
      start.value = delivery.scheduled_at ? delivery.scheduled_at.replace(' ', 'T').slice(0, 16) : '';
      end.value = delivery.scheduled_end_at ? delivery.scheduled_end_at.replace(' ', 'T').slice(0, 16) : '';
      field('Start (Sri Lanka time)', start); field('End (Sri Lanka time)', end);
      select = element('select', ''); select.required = true; select.disabled = true;
      vehicle = element('select', ''); vehicle.className = 'delivery-vehicle-select'; vehicle.disabled = true;
      function clearVehicles() { var option = element('option', '', 'No vehicle · personnel only'); option.value = ''; vehicle.replaceChildren(option); vehicle.value = ''; vehicle.disabled = true; }
      function placeholder(text) { var option = element('option', '', text); option.value = ''; select.replaceChildren(option); select.value = ''; }
      function invalidate() { lookupEpoch++; resetConfirmation(); placeholder('Check availability for these times'); clearVehicles(); select.disabled = true; save.disabled = true; }
      start.oninput = end.oninput = invalidate; select.onchange = resetConfirmation;
      vehicle.onchange = resetConfirmation;
      find = actionButton('Check availability', async function () {
        if (pending) return;
        if (!start.value || !end.value || end.value <= start.value) { feedbackText('Enter a start and an end after the start.', true); return; }
        invalidate(); var lookup = lookupEpoch; find.disabled = true;
        feedbackText('Checking available personnel…', false);
        try {
          var responses = await Promise.all([
            EquipifyApi.query('/area-manager/deliveries/' + delivery.delivery_id + '/available-personnel', {scheduled_at: start.value, scheduled_end_at: end.value}),
            EquipifyApi.query('/area-manager/deliveries/' + delivery.delivery_id + '/available-vehicles', {scheduled_at: start.value, scheduled_end_at: end.value})
          ]);
          var res = responses[0], fleet = responses[1];
          if (!alive() || lookup !== lookupEpoch) return;
          if (!res.ok) { feedbackText(res.error, true); return; }
          if (!fleet.ok) { feedbackText(fleet.error, true); return; }
          placeholder(res.data.items.length ? 'Select delivery personnel' : 'No available personnel');
          res.data.items.forEach(function (person) { var option = element('option', '', person.full_name + ' · ' + person.license_class); option.value = String(person.user_id); select.append(option); });
          select.disabled = !res.data.items.length; save.disabled = !res.data.items.length;
          fleet.data.items.forEach(function (item) { var option = element('option', '', item.plate_number + ' · ' + item.vehicle_type + ' · ' + item.max_load_kg + ' kg'); option.value = String(item.vehicle_id); vehicle.append(option); });
          vehicle.disabled = false;
          if (delivery.vehicle_id && fleet.data.items.some(function (item) { return Number(item.vehicle_id) === Number(delivery.vehicle_id); })) vehicle.value = String(delivery.vehicle_id);
          feedbackText(res.data.items.length ? (fleet.data.items.length ? 'Availability is checked again when you confirm.' : 'No vehicles are available. You may reserve personnel only.') : 'No eligible personnel are available for this time window.', false);
        } finally { if (alive()) find.disabled = false; }
      });
      content.append(find); field('Available delivery personnel', select); field('Available vehicle (optional)', vehicle); invalidate();
    }
    async function submit() {
      if (pending || !alive()) return;
      if (!lifecycle && (cancelling ? !reason.value.trim() : (!select.value || select.disabled))) { feedbackText(cancelling ? 'Enter a cancellation reason.' : 'Select available personnel.', true); return; }
      if (!confirmed) {
        confirmed = true; save.textContent = lifecycle ? 'Confirm update' : cancelling ? 'Confirm cancellation' : 'Confirm reservation';
        feedbackText(lifecycle ? 'Confirm delivery #' + delivery.delivery_id + ' as ' + statuses[lifecycle] + '?' : cancelling ? 'Confirm cancellation of delivery #' + delivery.delivery_id + '?' : 'Confirm reservation for ' + select.selectedOptions[0].textContent + ', vehicle: ' + vehicle.selectedOptions[0].textContent + ', from ' + start.value.replace('T', ' ') + ' to ' + end.value.replace('T', ' ') + ' (Sri Lanka)?', false);
        save.focus(); return;
      }
      pending = true; save.disabled = true;
      if (find) { find.disabled = true; start.disabled = end.disabled = select.disabled = vehicle.disabled = true; } else if (reason) reason.disabled = true;
      feedbackText('Saving delivery update…', false);
      var body = {expected_version: Number(delivery.assignment_version)};
      if (lifecycle) body.status = lifecycle;
      else if (cancelling) body.reason = reason.value.trim();
      else { body.delivery_personnel_id = Number(select.value); body.scheduled_at = start.value; body.scheduled_end_at = end.value; body.vehicle_id = vehicle.value ? Number(vehicle.value) : null; }
      try {
        var res = await EquipifyApi.post('/area-manager/deliveries/' + delivery.delivery_id + (lifecycle ? '/status' : cancelling ? '/cancel' : '/assign'), body);
        if (!alive()) return;
        if (!res.ok) { feedbackText(res.error, true); confirmed = false; save.textContent = lifecycle ? 'Review update' : cancelling ? 'Review cancellation' : 'Review reservation'; return; }
        closeDialog(); await load(page);
        if (active()) { message(lifecycle ? 'Delivery updated and personnel notified.' : cancelling ? 'Delivery cancelled. Resources released and personnel notified.' : body.vehicle_id ? 'Personnel and vehicle assigned. Personnel notified.' : 'Personnel reserved and notified. Vehicle confirmation remains pending.', false); if (refresh) refresh.focus(); }
      } finally {
        pending = false;
        if (alive()) { save.disabled = false; if (find) { find.disabled = false; start.disabled = end.disabled = select.disabled = vehicle.disabled = false; } else if (reason) reason.disabled = false; }
      }
    }
    footer.append(dismiss, save); panel.append(heading, description, content, feedback, footer); document.body.append(panel);
    panel.addEventListener('cancel', function (event) { event.preventDefault(); dismiss.click(); });
    panel.showModal(); (reason || start || save).focus();
  }
  async function load(target) {
    if (busy || !active()) return;
    var version = generation;
    busy = true; list.setAttribute('aria-busy', 'true'); previous.disabled = next.disabled = true;
    if (refresh) refresh.disabled = true;
    if (summary) summary.textContent = 'Loading deliveries…';
    if (pageLabel) pageLabel.textContent = 'Loading';
    showState('loading', 'Loading deliveries', 'Getting the latest delivery updates for your area.');
    try {
      var res = await EquipifyApi.query('/area-manager/deliveries', {page: target, per_page: 10, status: status});
      if (version !== generation || !active()) return;
      if (!res.ok) {
        showState('error', res.status === 409 ? 'Area access unavailable' : 'Unable to load deliveries', res.error);
        if (summary) summary.textContent = 'Deliveries unavailable';
        if (pageLabel) pageLabel.textContent = '—';
        return;
      }
      assignmentSupported = res.data.assignment_supported === true;
      serverTime = res.data.server_time || '';
      var mode = document.querySelector('.delivery-view-only');
      if (mode) mode.textContent = assignmentSupported ? 'Delivery reservations' : 'Read-only overview';
      page = res.data.page; list.replaceChildren();
      if (!res.data.items.length) showState('empty', status ? 'No ' + statuses[status].toLowerCase() + ' deliveries' : 'No deliveries in your area', status ? 'Try another status to see more deliveries.' : 'Delivery requests will appear here when they are available.');
      res.data.items.forEach(function (delivery) { list.append(deliveryCard(delivery)); });
      previous.disabled = page <= 1; next.disabled = page >= res.data.total_pages;
      if (pageLabel) pageLabel.textContent = res.data.total_pages ? 'Page ' + page + ' of ' + res.data.total_pages : 'No pages';
      if (summary) {
        var start = (page - 1) * res.data.per_page + 1, end = start + res.data.items.length - 1;
        summary.textContent = res.data.total ? 'Showing ' + start + '–' + end + ' of ' + res.data.total + (res.data.total === 1 ? ' delivery' : ' deliveries') : '0 deliveries';
      }
    } finally {
      if (version === generation) { busy = false; list.setAttribute('aria-busy', 'false'); if (refresh) refresh.disabled = false; }
    }
  }
  filters.forEach(function (tab) { tab.onclick = function () { return setFilter(tab.dataset.filter === 'all' ? '' : tab.dataset.filter); }; });
  previous.onclick = function () { return load(page - 1); }; next.onclick = function () { return load(page + 1); };
  if (refresh) refresh.onclick = function () { return load(page); };
  load(1);
})();
