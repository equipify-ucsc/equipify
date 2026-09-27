/* ==========================================================================
   Equipify — shared Notifications page (vanilla JS)
   Exposes window.EquipifyNotifications.init().

   Needs, in order: shared/api.js, session.js, script.js, list.js,
   inbox-mock.js, inbox-badges.js. Used by <Role>/Notifications/ for every role
   but the freelance worker, and behaves like that page: a feed filtered by
   type and an "unread only" flag, paged, newest first, with "Mark read" on
   each unread item and "Mark all read" for the lot. The type filter's options
   and the icons come from the signed-in role (EquipifyInbox.notificationTypes),
   and an item that points somewhere gets a "View" link.
   ========================================================================== */

(function () {
  'use strict';

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

  /** "22 Sep 2026, 14:05". */
  function dateTime(value) {
    if (!value) return '';
    var d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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

  function init() {
    var Inbox = window.EquipifyInbox;
    var types = {};
    var typeFilter = document.getElementById('typeFilter');

    // The filter lists this role's own notification types.
    Inbox.notificationTypes().forEach(function (type) {
      types[type.value] = type;
      var option = element('option', null, type.label);
      option.value = type.value;
      typeFilter.appendChild(option);
    });

    var list = EquipifyList.create({
      source: Inbox.notifications,
      container: document.getElementById('notificationFeed'),
      filters: {
        type: typeFilter,
        unread: document.getElementById('unreadFilter')
      },
      pager: document.getElementById('notificationPager'),
      countLabel: document.getElementById('notificationCount'),
      // Stated rather than inherited, so the page size is visible next to the
      // row counts it has to divide. This is the list.js default.
      perPage: 10,
      emptyMessage: "You're all caught up.",
      renderItem: notificationItem
    });

    function notificationItem(notification) {
      var type = types[notification.type] || { icon: 'notifications', tone: 'draft' };
      var item = element('div', 'feed-item' + (notification.is_read ? '' : ' is-unread'));

      var badge = element('div', 'feed-icon feed-icon--' + type.tone);
      badge.appendChild(icon(type.icon));
      item.appendChild(badge);

      var body = element('div', 'feed-body');
      body.appendChild(element('p', 'feed-title', notification.title));
      body.appendChild(element('p', 'feed-text', notification.body));
      item.appendChild(body);

      var side = element('div', 'feed-side');
      side.appendChild(element('div', 'feed-when', dateTime(notification.created_at)));

      var actions = element('div', 'feed-actions');
      if (notification.link) {
        var view = element('a', 'btn-outline btn-sm', 'View');
        view.href = notification.link;
        // Opening it counts as reading it.
        view.addEventListener('click', function () {
          if (!notification.is_read) Inbox.markRead({ notification_id: notification.notification_id });
        });
        actions.appendChild(view);
      }
      if (!notification.is_read) {
        var mark = element('button', 'btn-outline btn-sm', 'Mark read');
        mark.type = 'button';
        mark.addEventListener('click', function () {
          markRead({ notification_id: notification.notification_id }, 'Marked as read.');
        });
        actions.appendChild(mark);
      }
      if (actions.childNodes.length) side.appendChild(actions);
      item.appendChild(side);

      return item;
    }

    document.getElementById('markAllReadBtn').addEventListener('click', function () {
      markRead({ all: true }, 'All notifications marked as read.');
    });

    function markRead(body, successMessage) {
      Inbox.markRead(body).then(function (res) {
        if (!res.ok) {
          toast(res.error);
          return;
        }
        toast(body.all && res.data.marked === 0 ? 'Nothing left to mark.' : successMessage);
        // Refetch so the feed reflects what is now read, then the badges.
        list.reload();
        if (window.EquipifyInboxBadges) window.EquipifyInboxBadges.refresh();
      });
    }
  }

  window.EquipifyNotifications = { init: init };
})();
