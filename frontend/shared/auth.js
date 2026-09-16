/* ==========================================================================
   Equipify — Shared auth helpers
   Vanilla JS, no dependencies. Exposes reusable form-interaction helpers on
   `window.EquipifyAuth` for the Login/Register pages to call from their own
   page-specific script (which still owns the actual form wiring, since the
   fields, submit behavior, and post-submit demo behavior differ per page).

   Loaded via <script src="../../shared/auth.js"></script> BEFORE each auth
   page's own script.js/auth.js.
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

  /**
   * Scores a candidate password 0-4 based on length/case/digit/symbol mix.
   */
  function scorePassword(value) {
    var score = 0;
    if (value.length >= 8) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    return score;
  }

  /**
   * Updates a row of `.password-strength-bar` elements plus an optional
   * label to reflect the strength of `value`.
   */
  function updateStrengthMeter(value, strengthBars, strengthLabel) {
    if (!strengthBars || !strengthBars.length) return;
    var score = value.length === 0 ? 0 : scorePassword(value);

    strengthBars.forEach(function (bar, index) {
      bar.classList.remove('filled', 'filled-weak');
      if (index < score) {
        bar.classList.add(score <= 1 ? 'filled-weak' : 'filled');
      }
    });

    if (strengthLabel) {
      var labels = [
        'Add a password to get started.',
        'Weak. Try adding a number and a symbol.',
        'Fair. Add a symbol to improve.',
        'Good strength.',
        'Strong password.',
      ];
      strengthLabel.textContent = labels[score];
    }
  }

  /**
   * Compares a confirm-password field against the primary password field,
   * toggling the confirm field's error state accordingly. Returns whether
   * they match (an empty confirm field counts as not-yet-invalid).
   */
  function checkPasswordsMatch(passwordInput, confirmInput, confirmError) {
    if (!confirmInput || !passwordInput) return true;
    if (confirmInput.value.length === 0) {
      clearFieldError(confirmInput, confirmError);
      return true;
    }
    var matches = confirmInput.value === passwordInput.value;
    if (matches) {
      clearFieldError(confirmInput, confirmError);
    } else {
      showFieldError(confirmInput, confirmError);
    }
    return matches;
  }

  window.EquipifyAuth = {
    initPasswordToggle: initPasswordToggle,
    clearFieldError: clearFieldError,
    showFieldError: showFieldError,
    scorePassword: scorePassword,
    updateStrengthMeter: updateStrengthMeter,
    checkPasswordsMatch: checkPasswordsMatch,
  };
})();
