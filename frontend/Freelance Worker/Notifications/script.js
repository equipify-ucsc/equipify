/* Persisted notification feed; shared bell polls unread counts. */

(function () {
  'use strict';

  var ICONS = { job: 'work', bid: 'gavel', payment: 'payments' };

  var list = EquipifyList.create({
    endpoint: '/freelancer/notifications',
    sessionScoped: true,
    container: document.getElementById('notificationFeed'),
    filters: {
      type: document.getElementById('typeFilter'),
      unread: document.getElementById('unreadFilter')
    },
    pager: document.getElementById('notificationPager'),
    countLabel: document.getElementById('notificationCount'),
    emptyMessage: "You're all caught up.",
    renderItem: notificationItem
  });

  function notificationItem(notification) {
    var item = Portal.element('div', 'feed-item' + (Number(notification.is_read) ? '' : ' is-unread'));

    var icon = Portal.element('div', 'feed-icon feed-icon--' + notification.type);
    icon.appendChild(Portal.icon(ICONS[notification.type] || 'notifications', 'icon'));
    item.appendChild(icon);

    var body = Portal.element('div', 'feed-body');
    body.appendChild(Portal.element('p', 'feed-title', notification.title));
    body.appendChild(Portal.element('p', 'feed-text', notification.body));
    item.appendChild(body);

    var side = Portal.element('div', 'feed-side');
    side.appendChild(Portal.element('div', 'feed-when', Portal.dateTime(notification.created_at)));
    if (!Number(notification.is_read)) {
      side.appendChild(Portal.button('Mark read', 'btn-outline btn-sm', function () {
        markRead({ notification_id: notification.notification_id }, 'Marked as read.');
      }));
    }
    item.appendChild(side);

    return item;
  }

  document.getElementById('markAllReadBtn').addEventListener('click', function () {
    markRead({ all: true }, 'All notifications marked as read.');
  });

  function markRead(body, successMessage) {
    EquipifyApi.post('/freelancer/notifications/read', body).then(function (res) {
      if (!res.ok) {
        window.showToast(res.error);
        return;
      }
      window.showToast(successMessage);
      // Refetch so the feed reflects whatever the server now considers read.
      list.reload();
    });
  }
})();
