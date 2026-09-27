/* ==========================================================================
   Equipify — inbox data over the API (vanilla JS, needs shared/api.js first)

   The API-backed twin of shared/inbox-mock.js: same window.EquipifyInbox
   surface, same {ok, status, data, error, fields} results, so
   shared/messages.js, shared/notifications.js and shared/inbox-badges.js work
   against either without knowing which is loaded. A page chooses by swapping
   one <script> tag.

   Loaded by the Delivery Personnel and Technician pages. The other roles still
   load inbox-mock.js, which is why the label and icon tables below are copied
   rather than shared — when those roles move across, the mock goes and this
   becomes the only copy.

   The rows themselves are placeholder data served from backend/fixtures/, but
   the page cannot tell: everything here is a real HTTP call, and read marks and
   sent messages persist for the session.
   ========================================================================== */

(function () {
  'use strict';

  var MAX_MESSAGE_LENGTH = 2000;

  var ROLE_LABELS = {
    customer: 'Customer',
    renting_party: 'Renting party',
    freelance_worker: 'Freelance worker',
    maintenance_tech: 'Technician',
    delivery_personnel: 'Delivery personnel',
    area_manager: 'Area manager',
    admin: 'Admin'
  };

  /** Who each role may start a conversation with. The server enforces it too. */
  var RULES = {
    customer: ['renting_party', 'freelance_worker', 'delivery_personnel', 'area_manager'],
    renting_party: ['customer', 'maintenance_tech', 'delivery_personnel', 'area_manager'],
    freelance_worker: ['customer'],
    maintenance_tech: ['renting_party', 'area_manager'],
    delivery_personnel: ['customer', 'renting_party', 'area_manager'],
    area_manager: ['delivery_personnel', 'customer', 'maintenance_tech', 'renting_party', 'admin'],
    admin: ['customer', 'renting_party', 'freelance_worker', 'maintenance_tech', 'delivery_personnel', 'area_manager']
  };

  /** The filter options, feed icon and badge tone for each role's notifications. */
  var NOTIFICATION_TYPES = {
    maintenance_tech: [
      { value: 'appointment', label: 'Appointments', icon: 'event', tone: 'active' },
      { value: 'payment', label: 'Payments', icon: 'payments', tone: 'completed' },
      { value: 'complaint', label: 'Complaints', icon: 'flag', tone: 'rejected' }
    ],
    delivery_personnel: [
      { value: 'assignment', label: 'Assignments', icon: 'local_shipping', tone: 'active' },
      { value: 'payment', label: 'Payments', icon: 'payments', tone: 'completed' },
      { value: 'complaint', label: 'Complaints', icon: 'flag', tone: 'rejected' }
    ]
  };

  /** The signed-in role, from the page's own auth attribute. */
  function role() {
    var body = document.body;
    return (body && (body.getAttribute('data-inbox-role') || body.getAttribute('data-require-auth'))) || '';
  }

  function allowedRoles() {
    return (RULES[role()] || []).slice();
  }

  function canStart(targetRole) {
    return allowedRoles().indexOf(targetRole) !== -1;
  }

  function notificationTypes() {
    return (NOTIFICATION_TYPES[role()] || []).slice();
  }

  /** A local {ok:false} for the cases that never reach the server. */
  function fail(message, status) {
    return Promise.resolve({
      ok: false, status: status || 422, data: null, error: message, fields: {}
    });
  }

  // ---------- Conversations ----------
  function conversations(params) {
    return EquipifyApi.query('/conversations', params || {});
  }

  function conversation(conversationId) {
    return EquipifyApi.get('/conversations/' + encodeURIComponent(conversationId));
  }

  function messages(conversationId, params) {
    var query = {};
    Object.keys(params || {}).forEach(function (key) { query[key] = params[key]; });
    query.conversation_id = conversationId;
    return EquipifyApi.query('/messages', query);
  }

  /** @param {string} body the message text */
  function send(conversationId, body) {
    return EquipifyApi.post('/messages', { conversation_id: conversationId, body: body });
  }

  function start(personId, contextRef) {
    return EquipifyApi.post('/conversations', {
      person_id: personId,
      context_ref: contextRef || ''
    });
  }

  // ---------- People ----------
  function people(params) {
    return EquipifyApi.query('/messaging/contacts', params || {});
  }

  /**
   * Resolves a name from a "message this person" link to someone in the
   * contacts list. Unlike the mock, an unknown name is not invented — it is
   * reported as not found, because the server would refuse to open a thread
   * with somebody who does not exist.
   */
  function findPerson(name, personRole) {
    return people({ q: name, role: personRole || '', per_page: 50 }).then(function (res) {
      if (!res.ok) return res;

      var wanted = String(name || '').trim().toLowerCase();
      var match = null;
      res.data.items.forEach(function (person) {
        if (!match && String(person.name).toLowerCase() === wanted) match = person;
      });
      // Fall back to the first partial match, so a slightly different spelling
      // in a link still opens the right thread.
      if (!match && res.data.items.length) match = res.data.items[0];

      return match
        ? { ok: true, status: 200, data: match, error: '', fields: {} }
        : { ok: false, status: 404, data: null, error: 'That person is not in your contacts.', fields: {} };
    });
  }

  // ---------- Notifications ----------
  function notifications(params) {
    return EquipifyApi.query('/notifications', params || {});
  }

  /** {notification_id} for one, {all:true} for every one. */
  function markRead(body) {
    return EquipifyApi.put('/notifications/read', body || {});
  }

  function counts() {
    return EquipifyApi.get('/notifications/counts');
  }

  window.EquipifyInbox = {
    ROLE_LABELS: ROLE_LABELS,
    RULES: RULES,
    MAX_MESSAGE_LENGTH: MAX_MESSAGE_LENGTH,
    role: role,
    canStart: canStart,
    allowedRoles: allowedRoles,
    notificationTypes: notificationTypes,
    conversations: conversations,
    conversation: conversation,
    messages: messages,
    send: send,
    people: people,
    start: start,
    findPerson: findPerson,
    notifications: notifications,
    markRead: markRead,
    counts: counts,
    // Kept so a caller that reaches for it gets a clean rejection rather than
    // "undefined is not a function".
    unsupported: fail
  };
})();
