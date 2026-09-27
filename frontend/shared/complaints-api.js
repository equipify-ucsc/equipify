/* ==========================================================================
   Equipify — complaints data over the API (vanilla JS, needs shared/api.js)

   The API-backed twin of shared/complaints-mock.js: same
   window.EquipifyComplaints surface and the same
   {ok, status, data, error, fields} results, so shared/complaints.js renders
   the page against either without knowing which is loaded. A page chooses by
   swapping one <script> tag.

   Loaded by the Freelance Worker, Delivery Personnel and Technician Complaints
   pages. The other roles still load complaints-mock.js, which is why the
   tables below are copied rather than shared — when those roles move across,
   the mock goes and this becomes the only copy. The server enforces the same
   RULES and CATEGORIES; these exist so the form can be built before the first
   request comes back.
   ========================================================================== */

(function () {
  'use strict';

  var ROLE_LABELS = {
    customer: 'Customer',
    renting_party: 'Renting party',
    freelance_worker: 'Freelance worker',
    maintenance_tech: 'Technician',
    delivery_personnel: 'Delivery personnel'
  };

  /** Who each role may file a complaint against. */
  var RULES = {
    customer: ['renting_party', 'freelance_worker', 'delivery_personnel'],
    renting_party: ['customer', 'freelance_worker', 'delivery_personnel'],
    freelance_worker: ['customer'],
    maintenance_tech: ['renting_party'],
    delivery_personnel: ['customer']
  };

  var ALL = ['customer', 'renting_party', 'freelance_worker', 'delivery_personnel'];

  /** appliesTo: the against-roles a category is offered for. */
  var CATEGORIES = [
    { value: 'equipment_condition', label: 'Equipment condition / not as described', appliesTo: ['renting_party'] },
    { value: 'damage_loss', label: 'Damage or loss of equipment', appliesTo: ['customer', 'freelance_worker', 'delivery_personnel'] },
    { value: 'payment', label: 'Payment or refund issue', appliesTo: ALL },
    { value: 'late_no_show', label: 'Late, no-show or cancellation', appliesTo: ALL },
    { value: 'unsafe_conditions', label: 'Unsafe working conditions', appliesTo: ['customer', 'renting_party'] },
    { value: 'conduct', label: 'Conduct or harassment', appliesTo: ALL },
    { value: 'policy_fraud', label: 'Policy violation or fraud', appliesTo: ALL },
    { value: 'other', label: 'Other', appliesTo: ALL }
  ];

  /** tone = a .badge-status modifier. */
  var STATUSES = {
    submitted: { label: 'Submitted', tone: 'pending' },
    under_review: { label: 'Under review', tone: 'completed' },
    resolved: { label: 'Resolved', tone: 'active' },
    dismissed: { label: 'Dismissed', tone: 'draft' }
  };

  var PRIORITIES = {
    low: { label: 'Low', tone: 'completed' },
    medium: { label: 'Medium', tone: 'pending' },
    high: { label: 'High', tone: 'rejected' }
  };

  function categoriesFor(againstRole) {
    return CATEGORIES.filter(function (c) { return c.appliesTo.indexOf(againstRole) !== -1; });
  }

  function categoryLabel(value) {
    var found = null;
    CATEGORIES.forEach(function (c) { if (c.value === value) found = c; });
    return found ? found.label : value;
  }

  /**
   * The signed-in user's own complaints. `role` is accepted so the signature
   * matches the mock, but it is ignored: the server takes the role from the
   * session, which is the only trustworthy source.
   */
  function mine(role, params) {
    return EquipifyApi.query('/complaints', params || {});
  }

  /**
   * The platform-wide list. Only an admin may see it, and the admin pages
   * still read complaints-mock.js, so nothing calls this yet — it exists so
   * the surface matches the mock exactly.
   */
  function adminList(params) {
    return Promise.resolve({
      ok: false,
      status: 403,
      data: null,
      error: 'The platform-wide complaint list is not available here.',
      fields: {}
    });
  }

  /** `complainantName` is accepted for signature parity; the server uses the session. */
  function submit(role, body, complainantName) {
    return EquipifyApi.post('/complaints', body || {});
  }

  /**
   * Changing a complaint's status or priority is an admin action, and those
   * pages still use the mock. Kept so the surface matches.
   */
  function update(reference, changes) {
    return Promise.resolve({
      ok: false,
      status: 403,
      data: null,
      error: 'Only an admin can update a complaint.',
      fields: {}
    });
  }

  window.EquipifyComplaints = {
    ROLE_LABELS: ROLE_LABELS,
    RULES: RULES,
    CATEGORIES: CATEGORIES,
    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    categoriesFor: categoriesFor,
    categoryLabel: categoryLabel,
    mine: mine,
    adminList: adminList,
    submit: submit,
    update: update
  };
})();
