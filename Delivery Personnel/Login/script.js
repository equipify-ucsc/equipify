/* ==========================================================================
   Equipify — Delivery Personnel Login
   Vanilla JS. Handles the password visibility toggle and login validation
   states. No frameworks, no backend calls.
   ========================================================================== */

(function () {
  'use strict';

  function initPasswordToggle(toggleButton, input) {
    if (!toggleButton || !input) return;

    toggleButton.addEventListener('click', function () {
      var isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';

      var icon = toggleButton.querySelector('.material-symbols-outlined');
      if (icon) {
        icon.textContent = isHidden ? 'visibility_off' : 'visibility';
      }
      toggleButton.setAttribute(
        'aria-label',
        isHidden ? 'Hide password' : 'Show password'
      );

      input.focus({ preventScroll: true });
    });
  }

  function clearFieldError(input, errorMessageEl) {
    input.classList.remove('input-error');
    if (errorMessageEl) {
      errorMessageEl.style.display = 'none';
    }
  }

  function showFieldError(input, errorMessageEl) {
    input.classList.add('input-error');
    if (errorMessageEl) {
      errorMessageEl.style.display = 'flex';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('loginForm');
    if (!form) return;

    var passwordInput = document.getElementById('password');
    var passwordToggle = document.getElementById('passwordToggle');
    var passwordError = document.getElementById('passwordError');

    initPasswordToggle(passwordToggle, passwordInput);

    if (passwordInput) {
      clearFieldError(passwordInput, passwordError);

      passwordInput.addEventListener('input', function () {
        clearFieldError(passwordInput, passwordError);
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
          showFieldError(passwordInput, passwordError);
        }
        return;
      }

      // Placeholder success behavior (no backend wired up).
      form.querySelector('button[type="submit"]').textContent = 'Logging in…';
    });
  });
})();
