/* ==========================================================================
   Equipify — session guard + signed-in user details
   (vanilla JS, needs shared/api.js first)

   The pages are static HTML, so a protected page guards itself on load:
     <body data-require-auth="customer">  -> calls GET /auth/me and redirects
       to the login page if there is no valid session for that role.
     [data-logout]                        -> clicking it calls POST /auth/logout
       then goes to the login page.
   This is a UX guard only; the real protection is that every API endpoint
   checks the session and role.

   The signed-in user's details are markup-only too, so pages never hardcode
   them:
     [data-user-name]      -> the user's own name
     [data-display-name]   -> the name the topbar shows (a renting party's
                              business name, everyone else's own name)
     [data-user-district]  -> the user's district
     [data-user-avatar]    -> a placeholder avatar box; gets an <img> of the
                              profile photo when there is one
   window.EquipifySession.refresh() re-reads /auth/me and fills them again,
   for a profile page after it saves a new name or photo.

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

  function fillText(selector, value) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.textContent = value || '';
    });
  }

  /** Shows the photo in every [data-user-avatar] box, or the placeholder icon when there is none. */
  function renderAvatars(photoUrl) {
    document.querySelectorAll('[data-user-avatar]').forEach(function (box) {
      var img = box.querySelector('img[data-avatar-img]');
      if (!photoUrl) {
        if (img) img.remove();
        box.classList.remove('has-photo');
        return;
      }
      if (!img) {
        img = document.createElement('img');
        img.setAttribute('data-avatar-img', '');
        img.alt = '';
        box.appendChild(img);
      }
      img.src = EquipifyApi.url(photoUrl);
      box.classList.add('has-photo');
    });
  }

  function render(me) {
    fillText('[data-user-name]', me.full_name);
    fillText('[data-display-name]', me.display_name || me.full_name);
    fillText('[data-user-district]', me.district);
    renderAvatars(me.photo_url);
  }

  function refresh() {
    return EquipifyApi.get('/auth/me').then(function (res) {
      if (res.ok) render(res.data);
      return res;
    });
  }

  window.EquipifySession = { refresh: refresh, renderAvatars: renderAvatars };

  var requiredRole = document.body && document.body.getAttribute('data-require-auth');
  if (requiredRole) {
    // Hide the page until the session is confirmed so signed-out visitors
    // don't see a flash of protected content before the redirect.
    document.documentElement.style.visibility = 'hidden';

    EquipifyApi.get('/auth/me').then(function (res) {
      if (res.ok && res.data.role === requiredRole) {
        document.documentElement.style.visibility = '';
        render(res.data);
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
