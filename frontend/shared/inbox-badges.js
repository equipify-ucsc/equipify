/* ==========================================================================
   Equipify — unread counts in the sidenav and topbar (vanilla JS)
   Exposes window.EquipifyInboxBadges.refresh().

   Loaded after shared/inbox-mock.js on every dashboard-shell page, and on the
   Customer Browsing and Detailed pages. Fills every
     [data-inbox-count="messages"]       unread messages
     [data-inbox-count="notifications"]  unread notifications
   with its number, and hides it at 0. A badge with data-inbox-dot is a plain
   dot (the Customer top-nav bell) and only shows or hides.

   Pages without a session guard (the public Customer pages) mark the body
   with data-inbox-role="customer"; there the badges only show once /auth/me
   confirms a customer is signed in, so a visitor never sees a count.
   ========================================================================== */

(function () {
  'use strict';

  function render(counts) {
    document.querySelectorAll('[data-inbox-count]').forEach(function (badge) {
      var n = counts ? counts[badge.getAttribute('data-inbox-count')] || 0 : 0;
      badge.hidden = n === 0;
      if (badge.hasAttribute('data-inbox-dot')) return;
      badge.textContent = n > 99 ? '99+' : String(n);
      var label = badge.getAttribute('data-inbox-count') === 'messages' ? 'unread messages' : 'unread notifications';
      badge.setAttribute('aria-label', n + ' ' + label);
    });
  }

  function refresh() {
    if (!window.EquipifyInbox) return Promise.resolve();
    return window.EquipifyInbox.counts().then(function (res) {
      render(res.ok ? res.data : null);
    });
  }

  window.EquipifyInboxBadges = { refresh: refresh };

  var body = document.body;
  var publicRole = body && !body.hasAttribute('data-require-auth') && body.getAttribute('data-inbox-role');

  if (publicRole && window.EquipifyApi) {
    render(null);
    EquipifyApi.get('/auth/me').then(function (res) {
      if (res.ok && res.data.role === publicRole) refresh();
    });
  } else {
    refresh();
  }
})();
