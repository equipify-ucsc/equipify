/* ==========================================================================
   Equipify — Renting Party Login & Register
   Page-specific form wiring, plus the business-logo/BR-certificate upload
   widget. Password-toggle, field-error, password-strength, and password-
   match helpers live in ../../shared/auth.js as window.EquipifyAuth. No
   backend calls.
   ========================================================================== */

(function () {
  'use strict';

  /**
   * Wires a file input to an .upload-card label: clicking the card opens
   * the file picker (native <label for>), and selecting a file swaps the
   * icon/text and marks the card as filled.
   */
  function initFileUpload(dropZone, fileInput, textLabel, defaultText) {
    if (!dropZone || !fileInput || !textLabel) return;

    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files.length > 0) {
        textLabel.textContent = fileInput.files[0].name;
        dropZone.classList.add('has-file');
      } else {
        textLabel.textContent = defaultText;
        dropZone.classList.remove('has-file');
      }
    });
  }

  /* ---------------- Login page ---------------- */
  function initLoginPage() {
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

    initFileUpload(
      document.getElementById('logoDropZone'),
      document.getElementById('businessLogo'),
      document.getElementById('logoText'),
      'Upload business logo'
    );
    initFileUpload(
      document.getElementById('brDropZone'),
      document.getElementById('brCertificate'),
      document.getElementById('brText'),
      'Upload BR certificate (PDF)'
    );

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
