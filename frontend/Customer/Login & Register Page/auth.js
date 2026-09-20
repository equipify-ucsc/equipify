/* ==========================================================================
   Equipify — Customer Login & Register
   Page-specific form wiring. Password-toggle, field-error, password-strength,
   and password-match helpers live in ../../shared/auth.js as
   window.EquipifyAuth; server calls go through ../../shared/api.js as
   window.EquipifyApi.
   ========================================================================== */

(function () {
  'use strict';

  var AFTER_LOGIN = '../Browsing page/index.html';
  var AFTER_REGISTER = '../Profile/index.html';
  var REMEMBER_KEY = 'equipify.customerEmail';

  /* ---------------- Shared helpers ---------------- */

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) { /* storage unavailable: remember-me just doesn't persist */ }
  }

  function setErrorText(errorEl, message) {
    var textEl = errorEl.querySelector('.error-text');
    if (textEl) textEl.textContent = message;
  }

  /**
   * Shows `message` under a field. Uses the field's existing .error-message
   * element when the markup has one, otherwise creates it once beside the
   * field. Message is set via textContent (server text is never parsed as HTML).
   */
  function showError(input, message, existingEl) {
    var errorEl = existingEl || input._errorEl;
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.className = 'error-message';
      errorEl.setAttribute('role', 'alert');
      var icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.textContent = 'error';
      var text = document.createElement('span');
      text.className = 'error-text';
      errorEl.appendChild(icon);
      errorEl.appendChild(text);
      var anchor = input.closest('.password-wrap') || input.closest('.checkbox-row') || input;
      anchor.parentNode.insertBefore(errorEl, anchor.nextSibling);
      input._errorEl = errorEl;
    }
    setErrorText(errorEl, message);
    EquipifyAuth.showFieldError(input, errorEl);
  }

  function clearError(input, existingEl) {
    var errorEl = existingEl || input._errorEl;
    if (errorEl) EquipifyAuth.clearFieldError(input, errorEl);
    else input.classList.remove('input-error');
  }

  function showFormError(errorEl, message) {
    if (!errorEl) return;
    setErrorText(errorEl, message);
    errorEl.style.display = 'flex';
  }

  function setBusy(button, busy, busyLabel) {
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = busyLabel;
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
    }
    button.disabled = busy;
  }

  /* ---------------- Login page ---------------- */
  function initLoginPage() {
    var form = document.getElementById('loginForm');
    if (!form) return;

    var emailInput = document.getElementById('email');
    var passwordInput = document.getElementById('password');
    var passwordToggle = document.getElementById('passwordToggle');
    var passwordError = document.getElementById('passwordError');
    var rememberBox = document.getElementById('remember');
    var submitBtn = form.querySelector('button[type="submit"]');

    EquipifyAuth.initPasswordToggle(passwordToggle, passwordInput);

    // Start clean; the error only shows after a failed attempt.
    EquipifyAuth.clearFieldError(passwordInput, passwordError);
    passwordInput.value = '';
    passwordInput.addEventListener('input', function () {
      EquipifyAuth.clearFieldError(passwordInput, passwordError);
    });
    emailInput.addEventListener('input', function () {
      EquipifyAuth.clearFieldError(passwordInput, passwordError);
    });

    // "Remember me" only prefills the email; the password is never stored.
    var remembered = storageGet(REMEMBER_KEY);
    if (remembered) {
      emailInput.value = remembered;
      rememberBox.checked = true;
    }

    // Already signed in? Skip the form.
    EquipifyApi.get('/auth/me').then(function (res) {
      if (res.ok && res.data.role === 'customer') {
        window.location.replace(AFTER_LOGIN);
      }
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var email = emailInput.value.trim();
      if (!emailInput.checkValidity() || email === '' || passwordInput.value === '') {
        setErrorText(passwordError, 'Enter your email and password');
        EquipifyAuth.showFieldError(passwordInput, passwordError);
        return;
      }

      setBusy(submitBtn, true, 'Logging in…');
      EquipifyApi.post('/auth/login', {
        email: email,
        password: passwordInput.value
      }).then(function (res) {
        if (res.ok) {
          storageSet(REMEMBER_KEY, rememberBox.checked ? email : null);
          window.location.href = AFTER_LOGIN;
          return;
        }
        setBusy(submitBtn, false);
        setErrorText(passwordError, res.error);
        EquipifyAuth.showFieldError(passwordInput, passwordError);
      });
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
    var formError = document.getElementById('formError');
    var submitBtn = form.querySelector('button[type="submit"]');

    // Server field key -> input element (ids are the form's field ids).
    var fields = {
      full_name: document.getElementById('fullName'),
      email: document.getElementById('email'),
      phone: document.getElementById('phone'),
      company: document.getElementById('company'),
      address: document.getElementById('address'),
      district: document.getElementById('district'),
      password: passwordInput,
      confirm_password: confirmInput,
      terms: document.getElementById('terms')
    };

    EquipifyAuth.initPasswordToggle(passwordToggle, passwordInput);
    EquipifyAuth.initPasswordToggle(confirmToggle, confirmInput);

    // Start clean instead of the shipped "mismatched" hard-coded state.
    EquipifyAuth.clearFieldError(confirmInput, confirmError);
    confirmInput.value = '';
    passwordInput.value = '';

    function checkMatch() {
      return EquipifyAuth.checkPasswordsMatch(passwordInput, confirmInput, confirmError);
    }

    passwordInput.addEventListener('input', function () {
      EquipifyAuth.updateStrengthMeter(passwordInput.value, strengthBars, strengthLabel);
      if (confirmInput.value.length > 0) checkMatch();
    });
    EquipifyAuth.updateStrengthMeter(passwordInput.value, strengthBars, strengthLabel);
    confirmInput.addEventListener('input', checkMatch);

    // Clear a field's error as soon as the user edits it.
    Object.keys(fields).forEach(function (key) {
      var input = fields[key];
      if (!input || input === confirmInput) return;
      input.addEventListener(input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input',
        function () {
          clearError(input);
          formError.style.display = 'none';
        });
    });

    // Profile photo preview (upload to the server is not wired yet).
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

    /** Client-side pre-check (UX only; the server validates again). */
    function validateLocally() {
      var errors = {};
      if (fields.full_name.value.trim() === '') errors.full_name = 'Full name is required.';
      if (fields.email.value.trim() === '' || !fields.email.checkValidity()) {
        errors.email = 'Enter a valid email address.';
      }
      if (fields.phone.value.trim() === '') errors.phone = 'Phone number is required.';
      if (fields.address.value.trim() === '') errors.address = 'Address is required.';
      if (fields.district.value === '') errors.district = 'Select your district.';
      var pw = passwordInput.value;
      if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
        errors.password = 'Password must be at least 8 characters and include a letter and a number.';
      }
      if (!fields.terms.checked) {
        errors.terms = 'You must accept the Terms of Service and Privacy Policy.';
      }
      return errors;
    }

    function applyErrors(errors) {
      var first = null;
      Object.keys(errors).forEach(function (key) {
        var input = fields[key];
        if (!input) return;
        if (input === confirmInput) showError(input, errors[key], confirmError);
        else showError(input, errors[key]);
        if (!first) first = input;
      });
      if (first) first.focus({ preventScroll: false });
      return first !== null;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      formError.style.display = 'none';

      var errors = validateLocally();
      if (!checkMatch()) {
        errors.confirm_password = 'Passwords do not match';
      } else if (confirmInput.value === '') {
        errors.confirm_password = 'Confirm your password';
      }
      if (applyErrors(errors)) return;

      setBusy(submitBtn, true, 'Creating account…');
      EquipifyApi.post('/auth/register', {
        full_name: fields.full_name.value.trim(),
        email: fields.email.value.trim(),
        phone: fields.phone.value.trim(),
        company: fields.company.value.trim(),
        address: fields.address.value.trim(),
        district: fields.district.value,
        password: passwordInput.value,
        confirm_password: confirmInput.value,
        terms: fields.terms.checked
      }).then(function (res) {
        if (res.ok) {
          window.location.href = AFTER_REGISTER;
          return;
        }
        setBusy(submitBtn, false);
        if (!applyErrors(res.fields)) {
          showFormError(formError, res.error);
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLoginPage();
    initRegisterPage();
  });
})();
