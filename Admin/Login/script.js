/* ==========================================================================
   Equipify — Administrator Login
   Vanilla JS. Handles the password visibility toggle and login validation
   states. No backend — successful validation redirects straight to the
   admin dashboard (demo behavior carried over from the original page).
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

      var emailInput = document.getElementById('email');
      var emailValid = emailInput && emailInput.checkValidity();
      var passwordValid = passwordInput && passwordInput.checkValidity();

      if (!emailValid || !passwordValid) {
        if (passwordInput && !passwordValid) {
          showFieldError(passwordInput, passwordError);
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
