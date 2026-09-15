/* ==========================================================================
   Equipify — Customer Login & Register
   Page-specific form wiring only. Password-toggle, field-error, password-
   strength, and password-match helpers live in ../../shared/auth.js as
   window.EquipifyAuth. No backend calls.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------- Login page ---------------- */
  function initLoginPage() {
    var form = document.getElementById('loginForm');
    if (!form) return;

    var passwordInput = document.getElementById('password');
    var passwordToggle = document.getElementById('passwordToggle');
    var passwordError = document.getElementById('passwordError');

    EquipifyAuth.initPasswordToggle(passwordToggle, passwordInput);

    // The shipped markup hard-coded an error state (red field + wrong
    // password prefilled). Start the form clean; only show the error
    // after an actual failed submit attempt.
    if (passwordInput) {
      EquipifyAuth.clearFieldError(passwordInput, passwordError);
      passwordInput.value = '';

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
  }

  /* ---------------- Registration page ---------------- */
  function initRegisterPage() {
    var form = document.getElementById('registerForm');
    if (!form) return;

    var passwordInput = document.getElementById('password');
    var passwordToggle = document.getElementById('passwordToggle');
    var confirmInput = document.getElementById('confirmPassword');
    var confirmToggle = document.getElementById('confirmPasswordToggle');
    var confirmError = document.getElementById('confirmPasswordError');
    var strengthBars = document.querySelectorAll('.password-strength-bar');
    var strengthLabel = document.getElementById('passwordStrengthLabel');

    EquipifyAuth.initPasswordToggle(passwordToggle, passwordInput);
    EquipifyAuth.initPasswordToggle(confirmToggle, confirmInput);

    // Start clean instead of the shipped "mismatched" hard-coded state.
    if (confirmInput) {
      EquipifyAuth.clearFieldError(confirmInput, confirmError);
      confirmInput.value = '';
    }
    if (passwordInput) {
      passwordInput.value = '';
    }

    function checkMatch() {
      return EquipifyAuth.checkPasswordsMatch(passwordInput, confirmInput, confirmError);
    }

    if (passwordInput) {
      passwordInput.addEventListener('input', function () {
        EquipifyAuth.updateStrengthMeter(passwordInput.value, strengthBars, strengthLabel);
        if (confirmInput && confirmInput.value.length > 0) {
          checkMatch();
        }
      });
      EquipifyAuth.updateStrengthMeter(passwordInput.value, strengthBars, strengthLabel);
    }

    if (confirmInput) {
      confirmInput.addEventListener('input', checkMatch);
    }

    // Profile photo preview.
    var photoInput = document.getElementById('profilePhotoInput');
    var photoPreview = document.getElementById('profilePhotoPreview');
    var uploadBtn = document.getElementById('uploadPhotoBtn');

    if (uploadBtn && photoInput) {
      uploadBtn.addEventListener('click', function () {
        photoInput.click();
      });
    }

    if (photoInput && photoPreview) {
      photoInput.addEventListener('change', function () {
        var file = photoInput.files && photoInput.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function (event) {
          photoPreview.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!checkMatch()) return;
      // UI-only demo: no backend wired up.
      form.querySelector('button[type="submit"]').textContent = 'Creating account…';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLoginPage();
    initRegisterPage();
  });
})();
