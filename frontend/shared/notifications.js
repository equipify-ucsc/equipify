/* Shared authenticated notifications; one poller serves desktop and mobile bells. */
(function () {
  'use strict';
  if (window.EquipifyNotifications || !window.EquipifyApi) return;
  window.EquipifyNotifications = true;
  var buttons = [];
  document.querySelectorAll('.topbar-actions').forEach(function (host) {
    var bell = host.querySelector('button[aria-label="Notifications"]');
    if (!bell) {
      bell = document.createElement('button'); bell.type = 'button'; bell.className = 'icon-btn';
      bell.setAttribute('aria-label', 'Notifications');
      var symbol = document.createElement('span'); symbol.className = 'icon'; symbol.textContent = 'notifications';
      symbol.setAttribute('aria-hidden', 'true'); bell.append(symbol); host.prepend(bell);
    }
    bell.className += ' eqn-bell';
    bell.setAttribute('aria-haspopup', 'dialog'); bell.setAttribute('aria-expanded', 'false');
    buttons.push(bell);
  });
  if (!buttons.length) return;
  // Resolve from this script so every role shares CSS at any app base path.
  var stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('notifications.css', document.currentScript.src).href;
  document.head.append(stylesheet);
  function element(tag, className, text) {
    var node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(name) {
    var paths = {
      bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
      close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 4 4L19 6',
      previous: 'm14 6-6 6 6 6', next: 'm10 6 6 6-6 6',
      empty: 'M4 5h16v14H4zM4 13h4l2 3h4l2-3h4',
      error: 'M12 3 2 21h20L12 3ZM12 9v5m0 3v1'
    };
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', paths[name]); svg.append(path); return svg;
  }
  function button(className, label, symbol) {
    var node = element('button', className); node.type = 'button';
    if (symbol) node.append(icon(symbol));
    node.append(element('span', '', label)); return node;
  }
  var panel = element('dialog', 'equipify-notifications'); panel.id = 'equipify-notification-dialog';
  panel.setAttribute('aria-labelledby', 'equipify-notification-title');
  panel.setAttribute('aria-describedby', 'equipify-notification-summary');
  var header = element('header', 'eqn-header'), headingIcon = element('span', 'eqn-heading-icon');
  headingIcon.append(icon('bell'));
  var heading = element('div', 'eqn-heading'), title = element('h2', 'eqn-title', 'Notifications');
  title.id = 'equipify-notification-title';
  var summary = element('p', 'eqn-summary', 'Checking for updates…'); summary.id = 'equipify-notification-summary';
  heading.append(title, summary);
  var close = button('eqn-close', 'Close notifications', 'close'); close.setAttribute('aria-label', 'Close notifications');
  header.append(headingIcon, heading, close);
  var toolbar = element('div', 'eqn-toolbar'), unreadLabel = element('span', 'eqn-unread-count', 'Checking unread…');
  var markAll = button('eqn-button eqn-button--all', 'Mark all as read', 'check'); markAll.disabled = true;
  toolbar.append(unreadLabel, markAll);
  var feedback = element('p', 'eqn-feedback'); feedback.setAttribute('role', 'status'); feedback.hidden = true;
  var feed = element('div', 'eqn-feed'); feed.setAttribute('role', 'list'); feed.setAttribute('aria-label', 'Notification list');
  var footer = element('footer', 'eqn-footer'), pagination = element('nav', 'eqn-pagination');
  pagination.setAttribute('aria-label', 'Notification pages');
  var previous = button('eqn-button eqn-button--page', 'Previous', 'previous'); previous.setAttribute('aria-label', 'Previous notification page');
  var more = button('eqn-button eqn-button--page', 'Next', 'next'); more.setAttribute('aria-label', 'Next notification page');
  var pageLabel = element('span', 'eqn-page-label', 'Page 1'); pageLabel.setAttribute('role', 'status');
  close.setAttribute('data-eqn-focus', 'close'); markAll.setAttribute('data-eqn-focus', 'all');
  previous.setAttribute('data-eqn-focus', 'previous'); more.setAttribute('data-eqn-focus', 'next');
  pagination.append(previous, pageLabel, more); footer.append(pagination);
  panel.append(header, toolbar, feedback, feed, footer); document.body.append(panel);
  buttons.forEach(function (b) { b.setAttribute('aria-controls', panel.id); });
  var timer, busy = false, stopped = false, generation = 0, page = 1, listBusy = false, writeBusy = false;
  var unreadCount = null, opener = null, listTask = null, pollTask = null;
  function active() { return !stopped && !document.hidden && document.contains(panel) && buttons.some(function (b) { return document.contains(b); }); }
  function setFeedback(message, error) {
    feedback.textContent = message || ''; feedback.hidden = !message;
    feedback.className = 'eqn-feedback' + (error ? ' eqn-feedback--error' : '');
    feedback.setAttribute('role', error ? 'alert' : 'status');
  }
  function updateCount(count) {
    unreadCount = count;
    unreadLabel.textContent = count === null ? 'Unread count unavailable' : count + ' unread';
    summary.textContent = count === null ? 'Your latest Equipify updates.' : (count ? 'You have unread updates.' : 'You’re all caught up.');
    markAll.disabled = count === null || count === 0 || writeBusy || listBusy;
    buttons.forEach(function (b) {
      var badge = b.querySelector('[data-notification-count]');
      if (!badge) { badge = element('span', 'eqn-badge'); badge.dataset.notificationCount = ''; badge.setAttribute('aria-hidden', 'true'); b.append(badge); }
      badge.textContent = count === null ? '' : String(count); badge.hidden = !count;
      b.setAttribute('aria-description', count === null ? 'Unread count unavailable' : count + ' unread notifications');
    });
  }
  function dismiss() { if (panel.open) panel.close(); }
  panel.addEventListener('close', function () {
    buttons.forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    if (active() && opener && document.contains(opener)) opener.focus();
  });
  close.onclick = dismiss;
  panel.addEventListener('cancel', function (event) { event.preventDefault(); dismiss(); });
  panel.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') return;
    var controls = Array.prototype.filter.call(panel.querySelectorAll('button'), function (b) { return !b.disabled && !b.hidden; });
    var first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  function clear() {
    generation++; busy = listBusy = writeBusy = false; listTask = pollTask = null;
    feed.replaceChildren(); feed.setAttribute('aria-busy', 'false'); setFeedback(''); dismiss();
    previous.disabled = more.disabled = markAll.disabled = true;
    unreadCount = null; unreadLabel.textContent = 'Checking unread…'; summary.textContent = 'Checking for updates…'; pageLabel.textContent = '';
    buttons.forEach(function (b) {
      b.querySelectorAll('[data-notification-count]').forEach(function (n) { n.remove(); });
      b.setAttribute('aria-description', '');
    });
  }
  function stop() { stopped = true; clearTimeout(timer); clear(); }
  var unsubscribe = EquipifyApi.onSessionChange(stop);
  function schedule() { clearTimeout(timer); if (active()) timer = setTimeout(poll, 30000); }
  function poll(refreshList) {
    if (!active() || busy) return pollTask || Promise.resolve();
    busy = true; var version = generation;
    pollTask = (async function () {
      try {
        var res = await EquipifyApi.get('/notifications/unread-count');
        if (version !== generation || !active()) return;
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) { stop(); return; }
          updateCount(null);
          if (panel.open) setFeedback('Could not refresh the unread count. We’ll try again shortly.', true);
          return;
        }
        updateCount(Number(res.data.count));
        if (panel.open && refreshList !== false && !writeBusy) await load(page, true);
      } finally { if (version === generation) { busy = false; schedule(); } }
    })();
    return pollTask;
  }
  function state(kind, message) {
    var box = element('div', 'eqn-state eqn-state--' + kind);
    box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    var symbol = element('span', kind === 'loading' ? 'eqn-spinner' : 'eqn-state-icon');
    symbol.setAttribute('aria-hidden', 'true');
    if (kind !== 'loading') symbol.append(icon(kind === 'error' ? 'error' : 'empty'));
    box.append(symbol, element('h3', 'eqn-state-title', kind === 'loading' ? 'Loading notifications' : kind === 'error' ? 'Unable to load notifications' : 'Nothing here yet'));
    box.append(element('p', 'eqn-state-description', message));
    if (kind === 'error') {
      var retry = button('eqn-button eqn-button--read', 'Try again'); retry.onclick = function () { load(page); poll(false); }; box.append(retry);
    }
    feed.replaceChildren(box);
  }
  function restoreFocus(key, savedControl) {
    if (!key || !panel.open) return;
    var controls = Array.prototype.slice.call(panel.querySelectorAll('button'));
    // Do not take focus back if the user moved to another modal control.
    if (controls.indexOf(document.activeElement) !== -1 && document.activeElement !== savedControl) return;
    var target = controls.find(function (b) { return !b.disabled && b.getAttribute('data-eqn-focus') === key; });
    (target || (!markAll.disabled ? markAll : close)).focus();
  }
  function load(next, quiet) {
    if (!active() || listBusy) return listTask || Promise.resolve();
    listBusy = true; var version = generation;
    var savedControl = document.activeElement, focusKey = savedControl && savedControl.getAttribute('data-eqn-focus');
    var scrollPosition = feed.scrollTop;
    feed.setAttribute('aria-busy', 'true'); previous.disabled = more.disabled = markAll.disabled = true;
    if (!quiet) state('loading', 'Getting your latest updates…');
    listTask = (async function () {
      try {
        var res = await EquipifyApi.query('/notifications', {page: next, per_page: 10});
        if (version !== generation || !active()) return;
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) { stop(); return; }
          state('error', res.error); pageLabel.textContent = 'Unavailable'; return;
        }
        page = res.data.page; feed.replaceChildren();
        if (!res.data.items.length) state('empty', 'New updates will appear here when there’s something to share.');
        res.data.items.forEach(function (n) {
          var unread = !Number(n.is_read), row = element('article', 'eqn-card' + (unread ? ' eqn-card--unread' : ''));
          row.setAttribute('role', 'listitem');
          var content = element('div', 'eqn-card-content'), top = element('div', 'eqn-card-heading');
          top.append(element('h3', 'eqn-card-title', n.title));
          if (unread) { var dot = element('span', 'eqn-unread-dot'); dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', 'Unread'); top.append(dot); }
          content.append(top, element('p', 'eqn-card-description', n.body));
          var meta = element('div', 'eqn-card-meta');
          if (n.created_at) {
            var date = new Date(String(n.created_at).replace(' ', 'T')), time = element('time', 'eqn-time');
            time.textContent = isNaN(date.getTime()) ? String(n.created_at) : date.toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
            if (!isNaN(date.getTime())) time.setAttribute('datetime', date.toISOString());
            meta.append(time);
          }
          if (unread) {
            var read = button('eqn-button eqn-button--read', 'Mark as read', 'check');
            read.setAttribute('data-eqn-focus', String(n.notification_id));
            read.onclick = function () { return markRead({notification_id: Number(n.notification_id)}, read); };
            meta.append(read);
          }
          content.append(meta); row.append(content); feed.append(row);
        });
        pageLabel.textContent = res.data.total_pages ? 'Page ' + page + ' of ' + res.data.total_pages : 'No notifications';
        previous.disabled = page <= 1; more.disabled = page >= res.data.total_pages;
        if (quiet) feed.scrollTop = scrollPosition;
      } finally {
        if (version === generation) {
          listBusy = false; feed.setAttribute('aria-busy', 'false');
          markAll.disabled = unreadCount === null || unreadCount === 0 || writeBusy;
          restoreFocus(focusKey, savedControl);
        }
      }
    })();
    return listTask;
  }
  async function markRead(body, control) {
    if (!active() || writeBusy) return;
    var version = generation, hadFocus = document.activeElement === control;
    writeBusy = true; control.disabled = markAll.disabled = true; setFeedback('');
    try {
      var result = await EquipifyApi.post('/notifications/read', body);
      if (version !== generation || !active()) return;
      if (!result.ok) {
        if (result.status === 401 || result.status === 403) { stop(); return; }
        setFeedback(result.error, true); return;
      }
      // Wait out an old refresh, then read the post-mutation list/count once.
      await listTask;
      if (version !== generation || !active()) return;
      await load(page, true);
      await pollTask;
      if (version !== generation || !active()) return;
      await poll(false);
      if (version === generation && active()) setFeedback(body.all ? 'All notifications marked as read.' : 'Notification marked as read.');
    } finally {
      if (version === generation) {
        writeBusy = false; control.disabled = false;
        markAll.disabled = unreadCount === null || unreadCount === 0 || listBusy;
        var usableFocus = Array.prototype.some.call(panel.querySelectorAll('button'), function (b) { return b === document.activeElement && !b.disabled; });
        if (hadFocus && panel.open && !usableFocus) (!markAll.disabled ? markAll : close).focus();
      }
    }
  }
  markAll.onclick = function () { return markRead({all: true}, markAll); };
  buttons.forEach(function (b) { b.addEventListener('click', function () {
    if (!active()) return;
    opener = b;
    if (!panel.open) { panel.showModal(); b.setAttribute('aria-expanded', 'true'); close.focus(); }
    setFeedback(''); load(page);
  }); });
  previous.onclick = function () { setFeedback(''); return load(page - 1); };
  more.onclick = function () { setFeedback(''); return load(page + 1); };
  document.addEventListener('visibilitychange', function () { clearTimeout(timer); clear(); if (active()) poll(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', function (event) { if (event.persisted) window.location.reload(); });
  var observer = new MutationObserver(function () {
    if (!document.contains(panel) || !buttons.some(function (b) { return document.contains(b); })) {
      stop(); unsubscribe(); observer.disconnect();
    }
  });
  observer.observe(document.body, {childList: true, subtree: true});
  poll();
})();
