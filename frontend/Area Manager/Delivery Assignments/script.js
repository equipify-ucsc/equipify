(function () {
  'use strict';
  var list = document.querySelector('.assignment-list'), page = 1, status = '', busy = false, generation = 0, stopped = false;
  var previous = document.getElementById('deliveryPrevious'), next = document.getElementById('deliveryNext');
  var pageLabel = document.getElementById('deliveryPage'), summary = document.getElementById('deliverySummary');
  var refresh = document.getElementById('refreshBtn'), filters = document.querySelectorAll('.filter-tab');
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
      var date = new Date(String(delivery.scheduled_at).replace(' ', 'T')), time = element('time', 'delivery-scheduled-time');
      time.textContent = isNaN(date.getTime()) ? String(delivery.scheduled_at) : date.toLocaleString(undefined, {year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
      if (!isNaN(date.getTime())) time.setAttribute('datetime', date.toISOString());
      schedule.append(time);
    } else schedule.append(element('span', 'delivery-unscheduled', 'Not scheduled'));
    card.append(header, route, schedule); return card;
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
