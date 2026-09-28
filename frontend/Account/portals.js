/* ==========================================================================
   Equipify — where each role signs in

   The one map from a role to its login page, shared by the two pages in this
   folder. Paths are relative to frontend/Account/<Page>/, which is why this
   file sits beside them rather than in shared/ — the pages that use it are
   all at the same depth.

   Admin is absent on purpose: admin accounts are created with
   backend/tools/create_admin.php and have no self-service password reset, so
   nothing here should ever send someone to the admin login.
   ========================================================================== */

(function () {
  'use strict';

  var LOGIN_URLS = {
    customer:           '../../Customer/Login & Register Page/login.html',
    renting_party:      '../../Renting Party/Login & Register Page/login.html',
    freelance_worker:   '../../Freelance Worker/Login & Register Page/login.html',
    delivery_personnel: '../../Delivery Personnel/Login/index.html',
    maintenance_tech:   '../../Technician/Login/index.html',
    area_manager:       '../../Area Manager/Login/index.html'
  };

  var LABELS = {
    customer:           'Customer',
    renting_party:      'Renting Party',
    freelance_worker:   'Freelance Worker',
    delivery_personnel: 'Delivery Personnel',
    maintenance_tech:   'Maintenance Technician',
    area_manager:       'Area Manager'
  };

  window.EquipifyPortals = {
    /**
     * The login page for a role, or the customer one when the role is unknown
     * or missing. Never returns null: every page here needs somewhere to send
     * the user back to.
     */
    loginUrl: function (role) {
      return LOGIN_URLS[role] || LOGIN_URLS.customer;
    },

    /** "Delivery Personnel" for delivery_personnel, for use in copy. */
    label: function (role) {
      return LABELS[role] || '';
    },

    /** The `portal` query parameter of the current page, '' when absent. */
    fromQuery: function () {
      var value = new URLSearchParams(window.location.search).get('portal') || '';
      return Object.prototype.hasOwnProperty.call(LOGIN_URLS, value) ? value : '';
    }
  };
})();
