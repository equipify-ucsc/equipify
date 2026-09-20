/* ==========================================================================
   Equipify — Delivery Personnel Login
   Page-specific form wiring only. Password-toggle and field-error helpers
   live in ../../shared/auth.js as window.EquipifyAuth.

   Signs in through POST /auth/login with portal 'delivery_personnel', so an
   account of any other role is rejected here.
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
      var passwordValid = passwordInput && passwordInput.value.length > 0;

      if (!emailValid || !passwordValid) {
        if (passwordInput) {
          EquipifyAuth.showFieldError(passwordInput, passwordError);
        }
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      var errorText = passwordError.querySelector('.error-text');
      submitBtn.textContent = 'Signing in…';
      submitBtn.disabled = true;
      EquipifyApi.post('/auth/login', {
        email: emailInput.value.trim(),
        password: passwordInput.value,
        portal: 'delivery_personnel'
      }).then(function (res) {
        if (res.ok) {
          window.location.href = '../Dashboard/index.html';
          return;
        }
        submitBtn.textContent = 'Log In';
        submitBtn.disabled = false;
        if (errorText) errorText.textContent = res.error;
        EquipifyAuth.showFieldError(passwordInput, passwordError);
      });
    });
  });
})();
