/* ==========================================================================
   Equipify — Technician Login
   Page-specific form wiring only. Password-toggle and field-error helpers
   live in ../../shared/auth.js as window.EquipifyAuth. No backend calls.
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
      // UI-only demo: no backend. Simply demonstrate the validation
      // states are wired correctly rather than actually authenticating.
      var emailInput = document.getElementById('email');
      var emailValid = emailInput && emailInput.checkValidity();
      var passwordValid = passwordInput && passwordInput.value.length > 0;

      if (!emailValid || !passwordValid) {
        if (passwordInput && !passwordValid) {
          EquipifyAuth.showFieldError(passwordInput, passwordError);
        }
        return;
      }

      // Placeholder success behavior (no backend wired up).
      form.querySelector('button[type="submit"]').textContent = 'Logging in…';
    });
  });
})();
