/* ==========================================================================
   Equipify — Customer session guard (vanilla JS, needs shared/api.js first)

   The pages are static HTML, so a protected page guards itself on load:
     <body data-require-auth="customer">  -> calls GET /auth/me and redirects
       to the login page if there is no valid session for that role.
     [data-logout]                        -> clicking it calls POST /auth/logout
       then goes to the login page.
   This is a UX guard only; the real protection is that every API endpoint
   checks the session and role.

   Login page location relative to a page at frontend/Customer/<Page>/.
   ========================================================================== */

(function () {
  'use strict';

  // Customer default; other roles set <body data-login-url="...">.
  var LOGIN_URL = (document.body && document.body.getAttribute('data-login-url')) ||
    '../Login & Register Page/login.html';

  function goToLogin() {
    window.location.replace(LOGIN_URL);
  }

  var requiredRole = document.body && document.body.getAttribute('data-require-auth');
  if (requiredRole) {
    // Hide the page until the session is confirmed so signed-out visitors
    // don't see a flash of protected content before the redirect.
    document.documentElement.style.visibility = 'hidden';

    EquipifyApi.get('/auth/me').then(function (res) {
      if (res.ok && res.data.role === requiredRole) {
        document.documentElement.style.visibility = '';
        // The topbar name is markup-only: any element with [data-user-name]
        // gets the signed-in user's name, so pages don't hardcode one.
        document.querySelectorAll('[data-user-name]').forEach(function (el) {
          el.textContent = res.data.full_name;
        });
      } else {
        // No session, wrong role, or server unreachable: fail closed.
        goToLogin();
      }
    });
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-logout]');
    if (!trigger) return;
    event.preventDefault();
    EquipifyApi.post('/auth/logout').then(goToLogin);
  });
})();
