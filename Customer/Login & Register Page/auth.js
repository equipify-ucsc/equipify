/* ==========================================================================
   Equipify — Shared Auth Script
   Vanilla JS. Handles password visibility toggles, live validation states,
   password strength meter, and the profile-photo preview on the
   registration page. No frameworks, no backend calls.
   ========================================================================== */

(function () {
  'use strict';

  /**
   * Wires up a show/hide toggle button for a password input.
   * Toggling updates the input type and swaps the icon + accessible label.
   */
  function initPasswordToggle(toggleButton, input) {
    if (!toggleButton || !input) return;

    toggleButton.addEventListener('click', function () {
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';

      const icon = toggleButton.querySelector('.material-symbols-outlined');
      if (icon) {
        icon.textContent = isHidden ? 'visibility_off' : 'visibility';
      }
      toggleButton.setAttribute(
        'aria-label',
        isHidden ? 'Hide password' : 'Show password'
      );

      // Keep focus on the field the user is editing.
      input.focus({ preventScroll: true });
    });
  }

  /**
   * Clears a field's error state (border/background/message) once the
   * user starts correcting it.
   */
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

  /* ---------------- Login page ---------------- */
  function initLoginPage() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');
    const passwordError = document.getElementById('passwordError');

    initPasswordToggle(passwordToggle, passwordInput);

    // The shipped markup hard-coded an error state (red field + wrong
    // password prefilled). Start the form clean; only show the error
    // after an actual failed submit attempt.
    if (passwordInput) {
      clearFieldError(passwordInput, passwordError);
      passwordInput.value = '';

      passwordInput.addEventListener('input', function () {
        clearFieldError(passwordInput, passwordError);
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      // UI-only demo: no backend. Simply demonstrate the validation
      // states are wired correctly rather than actually authenticating.
      const emailInput = document.getElementById('email');
      const emailValid = emailInput && emailInput.checkValidity();
      const passwordValid = passwordInput && passwordInput.value.length > 0;

      if (!emailValid || !passwordValid) {
        if (passwordInput && !passwordValid) {
          showFieldError(passwordInput, passwordError);
        }
        return;
      }

      // Placeholder success behavior (no backend wired up).
      form.querySelector('button[type="submit"]').textContent = 'Logging in…';
    });
  }

  /* ---------------- Registration page ---------------- */
  function initRegisterPage() {
    const form = document.getElementById('registerForm');
    if (!form) return;

    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');
    const confirmInput = document.getElementById('confirmPassword');
    const confirmToggle = document.getElementById('confirmPasswordToggle');
    const confirmError = document.getElementById('confirmPasswordError');
    const strengthBars = document.querySelectorAll('.password-strength-bar');
    const strengthLabel = document.getElementById('passwordStrengthLabel');

    initPasswordToggle(passwordToggle, passwordInput);
    initPasswordToggle(confirmToggle, confirmInput);

    // Start clean instead of the shipped "mismatched" hard-coded state.
    if (confirmInput) {
      clearFieldError(confirmInput, confirmError);
      confirmInput.value = '';
    }
    if (passwordInput) {
      passwordInput.value = '';
    }

    function scorePassword(value) {
      let score = 0;
      if (value.length >= 8) score += 1;
      if (/[A-Z]/.test(value)) score += 1;
      if (/[0-9]/.test(value)) score += 1;
      if (/[^A-Za-z0-9]/.test(value)) score += 1;
      return score; // 0-4
    }

    function updateStrengthMeter(value) {
      if (!strengthBars.length) return;
      const score = value.length === 0 ? 0 : scorePassword(value);

      strengthBars.forEach(function (bar, index) {
        bar.classList.remove('filled', 'filled-weak');
        if (index < score) {
          bar.classList.add(score <= 1 ? 'filled-weak' : 'filled');
        }
      });

      if (strengthLabel) {
        const labels = [
          'Add a password to get started.',
          'Weak. Try adding a number and a symbol.',
          'Fair. Add a symbol to improve.',
          'Good strength.',
          'Strong password.',
        ];
        strengthLabel.textContent = labels[score];
      }
    }

    function checkPasswordsMatch() {
      if (!confirmInput || !passwordInput) return true;
      if (confirmInput.value.length === 0) {
        clearFieldError(confirmInput, confirmError);
        return true;
      }
      const matches = confirmInput.value === passwordInput.value;
      if (matches) {
        clearFieldError(confirmInput, confirmError);
      } else {
        showFieldError(confirmInput, confirmError);
      }
      return matches;
    }

    if (passwordInput) {
      passwordInput.addEventListener('input', function () {
        updateStrengthMeter(passwordInput.value);
        if (confirmInput && confirmInput.value.length > 0) {
          checkPasswordsMatch();
        }
      });
      updateStrengthMeter(passwordInput.value);
    }

    if (confirmInput) {
      confirmInput.addEventListener('input', checkPasswordsMatch);
    }

    // Profile photo preview.
    const photoInput = document.getElementById('profilePhotoInput');
    const photoPreview = document.getElementById('profilePhotoPreview');
    const uploadBtn = document.getElementById('uploadPhotoBtn');

    if (uploadBtn && photoInput) {
      uploadBtn.addEventListener('click', function () {
        photoInput.click();
      });
    }

    if (photoInput && photoPreview) {
      photoInput.addEventListener('change', function () {
        const file = photoInput.files && photoInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
          photoPreview.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!checkPasswordsMatch()) return;
      // UI-only demo: no backend wired up.
      form.querySelector('button[type="submit"]').textContent = 'Creating account…';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLoginPage();
    initRegisterPage();
  });
})();
