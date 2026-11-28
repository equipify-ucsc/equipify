/* Behavioral regression tests with a small DOM adapter; no browser or network required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
class Events {
  constructor() { this.events = {}; }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  fire(name, event = {}) { for (const fn of this.events[name] || []) fn(event); }
}
class Node extends Events {
  constructor(tag = 'div') { super(); this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this._text = ''; this.open = false; this.disabled = false; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  append(...nodes) { nodes.forEach(n => { n.parent = this; this.children.push(n); }); }
  appendChild(n) { this.append(n); return n; }
  prepend(n) { n.parent = this; this.children.unshift(n); }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  remove() { this.parent.children = this.parent.children.filter(n => n !== this); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  get classList() {
    const node = this;
    return {toggle(name, enabled) { const classes = new Set((node.className || '').split(' ').filter(Boolean)); enabled ? classes.add(name) : classes.delete(name); node.className = [...classes].join(' '); }};
  }
  matches(s) {
    if (s[0] === '.') return (this.className || '').split(' ').includes(s.slice(1));
    if (s === '[data-notification-count]') return 'notificationCount' in this.dataset;
    if (s === 'button[aria-label="Notifications"]') return this.tagName === 'BUTTON' && this.attrs['aria-label'] === 'Notifications';
    return this.tagName.toLowerCase() === s;
  }
  querySelectorAll(s) { return this.children.flatMap(n => [...(n.matches(s) ? [n] : []), ...n.querySelectorAll(s)]); }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.fire('close'); } }
  click() { if (this.disabled) return; this.fire('click'); return this.onclick?.(); }
}
function environment(broadcast = true) {
  const document = new Events(); document.body = new Node('body'); document.hidden = false;
  document.head = new Node('head'); document.activeElement = document.body;
  document.currentScript = {src: 'http://127.0.0.1:18083/frontend/shared/notifications.js'};
  document.createElement = tag => { const node = new Node(tag); node.ownerDocument = document; return node; };
  document.createElementNS = (_, tag) => document.createElement(tag);
  document.querySelectorAll = s => document.body.querySelectorAll(s);
  document.querySelector = s => document.body.querySelector(s);
  document.contains = n => n === document.body || document.body.querySelectorAll('*').includes(n);
  // Selector-independent tree walk for contains().
  document.contains = n => { function has(root) { return root === n || root.children.some(has); } return has(document.body); };
  const window = new Events(); window.location = { reload() {} };
  const timers = new Map(), channels = [], requests = [], observers = [];
  let timerId = 0, identity = '1:admin', delayed = null, pending = null, failure = null, empty = false, unread = 2, deliveryResponse = null;
  const readIds = new Set(), posts = [];
  const sandbox = { window, document, console, Math, Date, Promise, URL,
    localStorage: {setItem() {}},
    BroadcastChannel: class { constructor() { channels.push(this); } postMessage() {} },
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} disconnect() {} },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      const pathname = url.replace('../../../backend/api', ''); requests.push(pathname);
      const params = new URLSearchParams(pathname.split('?')[1] || '');
      let data = {count: unread};
      if (pathname.startsWith('/notifications?') || pathname.startsWith('/freelancer/notifications?')) {
        data = {items: empty ? [] : [{notification_id: 1, title: 'Secret notification', body: '<script>Private body</script>', is_read: readIds.has(1) ? 1 : 0, created_at: '2026-11-28 10:30:00'}], page: empty ? 1 : Number(params.get('page') || 1), total_pages: empty ? 0 : 3, total: empty ? 0 : 21};
      }
      if (pathname === '/notifications/read') {
        const body = JSON.parse(options.body); posts.push(body);
        if (!failure) { unread = body.all ? 0 : Math.max(0, unread - 1); readIds.add(1); }
        data = {marked: 1};
      }
      if (pathname.startsWith('/area-manager/deliveries?')) {
        data = deliveryResponse || {items: [{delivery_id: 1, related_reference: 'SAFE-1', status: 'pending', pickup_address: 'Private pickup', delivery_address: 'Private destination', scheduled_at: null}], page: Number(params.get('page') || 1), per_page: 10, total_pages: 3, total: 21};
      }
      const responseIdentity = identity;
      const responseFailure = failure && pathname.startsWith(failure.path) ? failure : null;
      const reply = () => ({ok: !responseFailure, status: responseFailure ? responseFailure.status : 200, headers: {get: () => responseIdentity}, json: async () => responseFailure ? ({success: false, error: 'Synthetic request failure'}) : ({success: true, data})});
      if (delayed && pathname.startsWith(delayed)) return new Promise(resolve => { pending = () => resolve(reply()); });
      return Promise.resolve(reply());
    }
  };
  if (!broadcast) delete sandbox.BroadcastChannel;
  const context = vm.createContext(sandbox);
  function run(file) { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'shared', file), 'utf8'), context); }
  run('api.js'); sandbox.EquipifyApi = window.EquipifyApi;
  return {window, document, timers, channels, requests, observers, run, sandbox, posts,
    deliveries(value) { deliveryResponse = value; },
    fail(path, status = 500) { failure = path ? {path, status} : null; }, empty(value) { empty = value; },
    delay(prefix) { delayed = prefix; }, release() { delayed = null; const reply = pending; pending = null; reply(); }, setIdentity(value) { identity = value; }};
}
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
(async () => {
  const e = environment();
  for (let i = 0; i < 2; i++) { const host = new Node(); host.className = 'topbar-actions'; e.document.body.append(host); }
  e.run('notifications.js'); await flush();
  const bells = e.document.querySelectorAll('button[aria-label="Notifications"]');
  check(bells.length === 2, 'desktop and mobile each receive a bell');
  check(e.requests.filter(p => p === '/notifications/unread-count').length === 1, 'one initial poll for both bells');
  check(e.timers.size === 1, 'one polling timer');
  bells[0].click(); await flush();
  const panel = e.document.querySelector('dialog'), feed = panel.querySelector('.eqn-feed');
  const pager = panel.querySelector('.eqn-pagination'), previous = pager.children[0], next = pager.children[2];
  await next.click(); await flush();
  check(e.requests.at(-1).includes('page=2'), 'next page loads page 2');
  feed.querySelector('button').focus();
  const timer = [...e.timers.values()][0]; e.timers.clear(); await timer(); await flush();
  check(e.requests.at(-1).includes('page=2'), 'poll preserves page 2');
  check(e.document.activeElement === feed.querySelector('button'), 'background polling restores the focused notification action');
  await feed.querySelector('button').click(); await flush();
  check(e.requests.filter(p => p.startsWith('/notifications?')).slice(-2).every(p => p.includes('page=2')), 'mark-read and poll preserve page 2');
  check(!previous.disabled, 'previous navigation available on page 2');
  e.delay('/notifications?'); next.click(); await flush();
  e.document.hidden = true; e.document.fire('visibilitychange');
  e.release(); await flush();
  check(feed.textContent === '' && !panel.open, 'hidden page clears data and ignores pending list response');
  check(e.timers.size === 0, 'hidden page has no polling timers');
  e.document.hidden = false; e.document.fire('visibilitychange'); await flush();
  bells[1].click(); await flush();
  check(feed.textContent.includes('Secret'), 'mobile bell opens real feed');
  e.run('list.js'); const dedicated = new Node(); e.document.body.append(dedicated);
  e.window.EquipifyList.create({endpoint:'/freelancer/notifications',sessionScoped:true,container:dedicated,renderItem(n) {const row=new Node();row.textContent=n.title;return row;}});
  await flush(); check(dedicated.textContent.includes('Secret'), 'dedicated feed renders');
  e.delay('/notifications?'); next.click(); await flush();
  const logout = e.window.EquipifyApi.post('/auth/logout');
  check(feed.textContent === '' && !panel.open, 'logout immediately clears bell content');
  check(!dedicated.textContent.includes('Secret'), 'logout clears dedicated notification feed');
  e.release(); await logout; await flush();
  check(!feed.textContent.includes('Secret') && e.timers.size === 0, 'late response cannot restore content after logout');
  const other = environment();
  await other.window.EquipifyApi.get('/notifications/unread-count');
  other.delay('/notifications?'); const late = other.window.EquipifyApi.query('/notifications', {page:2});
  other.channels[0].onmessage({data:'changed'}); other.release();
  check(!(await late).ok, 'cross-window account switch rejects an earlier response');
  other.setIdentity('2:customer'); other.delay(null); await other.window.EquipifyApi.get('/notifications/unread-count');
  let changed = 0; other.window.EquipifyApi.onSessionChange(() => changed++);
  other.setIdentity('3:customer'); const mismatch = await other.window.EquipifyApi.get('/notifications/unread-count');
  check(!mismatch.ok && changed === 1, 'server identity change invalidates data even without a broadcast');
  const storage = environment(false);
  storage.delay('/notifications?'); const storageLate = storage.window.EquipifyApi.query('/notifications', {page:1});
  storage.window.fire('storage', {key:'equipify-session-change'}); storage.release();
  check(!(await storageLate).ok, 'storage events invalidate stale replies when BroadcastChannel is unavailable');
  const ui = environment(), uiHost = new Node(); uiHost.className = 'topbar-actions'; ui.document.body.append(uiHost);
  ui.run('notifications.js'); await flush();
  check(ui.document.head.children[0].href === 'http://127.0.0.1:18083/frontend/shared/notifications.css', 'shared CSS resolves beside the notification script');
  const uiBell = ui.document.querySelector('button[aria-label="Notifications"]');
  ui.delay('/notifications?'); uiBell.click();
  const modal = ui.document.querySelector('dialog'), uiFeed = modal.querySelector('.eqn-feed');
  const close = modal.querySelector('.eqn-close'), all = modal.querySelector('.eqn-button--all');
  check(!!uiFeed.querySelector('.eqn-state--loading') && uiFeed.getAttribute('aria-busy') === 'true', 'loading state is styled and exposed to assistive technology');
  check(ui.document.activeElement === close, 'opening places keyboard focus on close');
  ui.release(); await flush();
  check(modal.getAttribute('aria-labelledby') === 'equipify-notification-title', 'dialog has an accessible title');
  check(!!uiFeed.querySelector('.eqn-card--unread') && !!uiFeed.querySelector('.eqn-unread-dot'), 'unread cards have a distinct style and indicator');
  check(!!uiFeed.querySelector('time').getAttribute('datetime'), 'notification timestamps have machine-readable dates');
  check(uiFeed.textContent.includes('<script>Private body</script>') && !uiFeed.querySelector('script'), 'notification content stays escaped as text');
  let prevented = 0;
  modal.fire('keydown', {key:'Tab', shiftKey:true, preventDefault() { prevented++; }});
  const lastControl = modal.querySelector('.eqn-pagination').children[2];
  check(ui.document.activeElement === lastControl && prevented === 1, 'Shift+Tab wraps within the modal');
  modal.fire('keydown', {key:'Tab', shiftKey:false, preventDefault() { prevented++; }});
  check(ui.document.activeElement === close && prevented === 2, 'Tab wraps to the first modal control');
  modal.fire('cancel', {preventDefault() {}});
  check(!modal.open && ui.document.activeElement === uiBell && uiBell.getAttribute('aria-expanded') === 'false', 'Escape closes and returns focus to the originating bell');
  ui.fail('/notifications?'); uiBell.click(); await flush();
  check(!!uiFeed.querySelector('.eqn-state--error') && uiFeed.textContent.includes('Synthetic request failure'), 'API failures render an accessible error and retry control');
  ui.fail(null); uiFeed.querySelector('button').click(); await flush();
  check(!!uiFeed.querySelector('.eqn-card'), 'retry reloads real endpoint data after an error');
  ui.fail('/notifications/read'); await uiFeed.querySelector('button').click(); await flush();
  check(modal.querySelector('.eqn-feedback').getAttribute('role') === 'alert' && !uiFeed.querySelector('button').disabled, 'failed read actions announce errors and allow retry');
  ui.fail(null); ui.delay('/notifications/read'); all.focus(); const markAllPromise = all.click(); await flush();
  check(all.disabled, 'mark-all prevents repeated submissions while saving');
  const uiTimer = [...ui.timers.values()][0]; ui.timers.clear(); await uiTimer(); await flush();
  ui.release(); await markAllPromise; await flush();
  check(ui.posts.at(-1).all === true, 'mark-all uses the persisted all:true API contract');
  check(modal.querySelector('.eqn-unread-count').textContent === '0 unread' && all.disabled, 'mark-all refreshes header count and disables the completed action');
  check(!uiFeed.querySelector('button') && uiBell.querySelector('[data-notification-count]').hidden, 'read cards lose their read action and zero count hides the bell badge');
  check(ui.document.activeElement === close, 'completing mark-all returns focus to an enabled modal control');
  ui.empty(true); close.click(); uiBell.click(); await flush();
  check(!!uiFeed.querySelector('.eqn-state--empty') && modal.querySelector('.eqn-page-label').textContent === 'No notifications', 'empty lists display a designed empty state and pagination label');
  check(modal.querySelector('.eqn-pagination').children[0].disabled && modal.querySelector('.eqn-pagination').children[2].disabled, 'empty lists disable both page controls');
  ui.fail('/notifications/unread-count'); const failedPoll = [...ui.timers.values()][0]; ui.timers.clear(); await failedPoll();
  check(modal.open && modal.querySelector('.eqn-unread-count').textContent === 'Unread count unavailable', 'temporary count failures preserve the open modal and offer honest status');
  const removed = environment(); const host = new Node(); host.className='topbar-actions'; removed.document.body.append(host);
  removed.run('notifications.js'); await flush(); host.remove(); removed.observers[0]();
  check(removed.timers.size === 0, 'removing the view stops polling');
  const delivery = environment();
  const deliveryList = new Node('ul'); deliveryList.className = 'assignment-list'; delivery.document.body.append(deliveryList);
  const deliveryControls = {deliveryPrevious: new Node('button'), deliveryNext: new Node('button'), refreshBtn: new Node('button'), deliveryPage: new Node('span'), deliverySummary: new Node('p')};
  const deliveryFilters = ['all','pending','assigned','in_transit','delivered','cancelled'].map(value => {
    const node = new Node('button'); node.className = 'filter-tab'; node.dataset.filter = value; delivery.document.body.append(node); return node;
  });
  delivery.document.getElementById = id => deliveryControls[id];
  delivery.run('../Area Manager/Delivery Assignments/script.js'); await flush();
  check(deliveryList.textContent.includes('Private pickup'), 'delivery view renders authoritative addresses');
  check(deliveryList.querySelector('.delivery-title').textContent === 'Delivery #1' && deliveryList.querySelector('.delivery-reference').textContent === 'Reference SAFE-1', 'delivery identity and reference are separate readable fields');
  check(!!deliveryList.querySelector('.delivery-status--pending') && deliveryList.querySelectorAll('.delivery-location').length === 2, 'delivery cards have status badges and distinct pickup/drop-off blocks');
  check(deliveryList.querySelectorAll('svg').length === 4, 'truck, location and schedule icons render without external icon fonts');
  check(deliveryList.querySelector('.delivery-unscheduled').textContent === 'Not scheduled', 'missing schedule is shown honestly');
  check(deliveryControls.deliveryPage.textContent === 'Page 1 of 3' && deliveryControls.deliverySummary.textContent === 'Showing 1–1 of 21 deliveries', 'delivery pagination uses server totals');
  await deliveryControls.deliveryNext.click(); await flush();
  check(delivery.requests.at(-1).includes('page=2') && !deliveryControls.deliveryPrevious.disabled, 'delivery next page uses the API and enables previous');
  await deliveryControls.refreshBtn.click(); await flush();
  check(delivery.requests.at(-1).includes('page=2'), 'delivery refresh retains the selected page');
  await deliveryFilters[2].click(); await flush();
  check(delivery.requests.at(-1).includes('status=assigned') && delivery.requests.at(-1).includes('page=1'), 'status filters query the backend and reset pagination');
  check(deliveryFilters[2].getAttribute('aria-pressed') === 'true' && deliveryFilters[0].getAttribute('aria-pressed') === 'false', 'selected delivery filter is exposed accessibly');
  delivery.deliveries({items: [], page: 1, per_page: 10, total_pages: 0, total: 0});
  await deliveryControls.refreshBtn.click(); await flush();
  check(!!deliveryList.querySelector('.delivery-state--empty') && deliveryList.textContent.includes('No assigned deliveries'), 'filtered empty deliveries have a useful empty state');
  check(deliveryControls.deliveryPrevious.disabled && deliveryControls.deliveryNext.disabled && deliveryControls.deliverySummary.textContent === '0 deliveries', 'empty delivery pagination is disabled and reports zero');
  delivery.deliveries(null); await deliveryList.querySelector('button').click(); await flush();
  check(!delivery.requests.at(-1).includes('status=') && deliveryFilters[0].getAttribute('aria-pressed') === 'true', 'empty-state action returns to the real all-deliveries query');
  delivery.fail('/area-manager/deliveries?',409); await deliveryControls.refreshBtn.click(); await flush();
  check(!!deliveryList.querySelector('.delivery-state--error') && deliveryList.textContent.includes('Area access unavailable'), 'missing operational area displays its API error without leaking deliveries');
  delivery.fail(null);
  delivery.deliveries({items: [{delivery_id: 9, related_reference: '<script>REF</script>', status: 'in_transit', pickup_address: '<img src=x>', delivery_address: 'Drop-off', scheduled_at: '2026-11-28 15:30:00'}], page: 1, per_page: 10, total_pages: 1, total: 1});
  await deliveryList.querySelector('button').click(); await flush();
  check(!!deliveryList.querySelector('.delivery-status--in_transit') && !!deliveryList.querySelector('time').getAttribute('datetime'), 'retry restores status and formatted schedule from the API');
  check(deliveryList.textContent.includes('<script>REF</script>') && !deliveryList.querySelector('script') && !deliveryList.querySelector('img'), 'delivery references and addresses remain escaped text');
  check(deliveryList.querySelectorAll('button').length === 0 && delivery.posts.length === 0, 'delivery cards stay read-only and make no mutation requests');
  delivery.deliveries(null);
  delivery.delay('/area-manager/deliveries?'); deliveryControls.refreshBtn.click(); await flush();
  check(!!deliveryList.querySelector('.delivery-state--loading') && deliveryList.getAttribute('aria-busy') === 'true', 'pending delivery requests show an accessible loading state');
  delivery.document.hidden = true; delivery.document.fire('visibilitychange');
  delivery.release(); await flush();
  check(deliveryList.textContent === '', 'hidden delivery view clears addresses and ignores a pending response');
  delivery.document.hidden = false; delivery.document.fire('visibilitychange'); await flush();
  check(deliveryList.textContent.includes('Private pickup'), 'visible delivery view refreshes after hiding');
  delivery.delay('/area-manager/deliveries?'); deliveryControls.refreshBtn.click(); await flush();
  delivery.window.EquipifyApi.invalidateSession(false);
  check(!deliveryList.textContent.includes('Private pickup'), 'session invalidation clears delivery addresses');
  delivery.release(); await flush();
  check(!deliveryList.textContent.includes('Private pickup'), 'pending delivery reply cannot restore addresses after session invalidation');
  const beforeDeliveryRefresh = delivery.requests.length;
  deliveryControls.refreshBtn.click(); await flush();
  check(delivery.requests.length === beforeDeliveryRefresh, 'invalidated delivery view cannot fetch another account data');
  console.log(`PASS: ${checks} notification frontend/session regression checks`);
})().catch(error => { console.error(error); process.exitCode = 1; });
