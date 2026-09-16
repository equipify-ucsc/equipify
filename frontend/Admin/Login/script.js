/* ==========================================================================
   Equipify — Administrator Login
   Page-specific form wiring only. Password-toggle and field-error helpers
   live in ../../shared/auth.js as window.EquipifyAuth.

   No backend — successful validation redirects straight to the admin
   dashboard (demo behavior carried over from the original page).
   ========================================================================== */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('loginForm');
    if (!form) return;

    var passwordInput = document.getElementById('password');
    var passwordToggle = document.getElementById('passwordToggle');
    var passwordError = document.getElementById('passwordError');

    EquipifyAuth.initPasswordToggle(passwordToggle, passwordInput);

    if (passwordInput) {
      EquipifyAuth.clearFieldError(passwordInput, passwordError);

      passwordInput.addEventListener('input', function () {
        EquipifyAuth.clearFieldError(passwordInput, passwordError);
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var emailInput = document.getElementById('email');
      var emailValid = emailInput && emailInput.checkValidity();
      var passwordValid = passwordInput && passwordInput.checkValidity();

      if (!emailValid || !passwordValid) {
        if (passwordInput && !passwordValid) {
          EquipifyAuth.showFieldError(passwordInput, passwordError);
        }
        return;
      }

      // Demo behavior (no backend): confirm success, then redirect to the
      // admin dashboard.
      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.textContent = 'Signing in…';
      submitBtn.disabled = true;
      setTimeout(function () {
        window.location.href = '../Dashboard/index.html';
      }, 900);
    });
  });
})();
