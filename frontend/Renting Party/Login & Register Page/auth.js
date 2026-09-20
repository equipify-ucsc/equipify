/* ==========================================================================
   Equipify — Renting Party Login & Register
   Page-specific form wiring, plus the business-logo/BR-certificate upload
   widget. Password-toggle, field-error, password-strength, and password-
   match helpers live in ../../shared/auth.js as window.EquipifyAuth; server
   calls go through ../../shared/api.js as window.EquipifyApi.
   ========================================================================== */

(function () {
  'use strict';

  var AFTER_LOGIN = '../Dashboard/index.html';
  var AFTER_REGISTER = '../Dashboard/index.html';
  var REMEMBER_KEY = 'equipify.rentingPartyEmail';
  var MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // matches the server limit per file

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
      var anchor = input.closest('.password-wrap') || input.closest('.checkbox-row') ||
                   input.closest('.upload-card') || input;
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

  /**
   * Reads the chosen file as {name, data: base64} for the JSON API, or
   * resolves null when nothing is chosen.
   */
  function readFile(fileInput) {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return Promise.resolve(null);
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result);
        resolve({ name: file.name, data: result.slice(result.indexOf(',') + 1) });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
      if (res.ok && res.data.role === 'renting_party') {
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
        portal: 'renting_party',
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
      business_name: document.getElementById('businessName'),
      owner_name: document.getElementById('ownerName'),
      reg_no: document.getElementById('regNumber'),
      email: document.getElementById('email'),
      phone: document.getElementById('phone'),
      district: document.getElementById('district'),
      address: document.getElementById('address'),
      password: passwordInput,
      confirm_password: confirmInput,
      logo: document.getElementById('businessLogo'),
      br_certificate: document.getElementById('brCertificate'),
      terms: document.getElementById('terms')
    };

    EquipifyAuth.initPasswordToggle(passwordToggle, passwordInput);
    EquipifyAuth.initPasswordToggle(confirmToggle, confirmInput);

    // Start clean; the mismatch error only shows once the user has typed.
    EquipifyAuth.clearFieldError(confirmInput, confirmError);

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
      var type = input.type === 'checkbox' || input.type === 'file' || input.tagName === 'SELECT'
        ? 'change' : 'input';
      input.addEventListener(type, function () {
        clearError(input);
        formError.style.display = 'none';
      });
    });

    initFileUpload(
      document.getElementById('logoDropZone'),
      fields.logo,
      document.getElementById('logoText'),
      'Upload business logo (max 2 MB)'
    );
    initFileUpload(
      document.getElementById('brDropZone'),
      fields.br_certificate,
      document.getElementById('brText'),
      'Upload BR certificate (PDF or image, max 2 MB)'
    );

    /** Client-side pre-check (UX only; the server validates again). */
    function validateLocally() {
      var errors = {};
      if (fields.business_name.value.trim() === '') errors.business_name = 'Business name is required.';
      if (fields.owner_name.value.trim() === '') errors.owner_name = 'Owner name is required.';
      if (fields.reg_no.value.trim() === '') errors.reg_no = 'Registration number is required.';
      if (fields.email.value.trim() === '' || !fields.email.checkValidity()) {
        errors.email = 'Enter a valid email address.';
      }
      if (fields.phone.value.trim() === '') errors.phone = 'Phone number is required.';
      if (fields.district.value === '') errors.district = 'Select your district.';
      if (fields.address.value.trim() === '') errors.address = 'Business address is required.';
      var pw = passwordInput.value;
      if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
        errors.password = 'Password must be at least 8 characters and include a letter and a number.';
      }
      if (confirmInput.value === '') {
        errors.confirm_password = 'Confirm your password';
      } else if (confirmInput.value !== pw) {
        errors.confirm_password = 'Passwords do not match';
      }

      var cert = fields.br_certificate.files && fields.br_certificate.files[0];
      var logo = fields.logo.files && fields.logo.files[0];
      if (!cert) errors.br_certificate = 'Upload your business registration certificate.';
      else if (cert.size > MAX_UPLOAD_BYTES) errors.br_certificate = 'Registration certificate must be at most 2 MB.';
      if (logo && logo.size > MAX_UPLOAD_BYTES) errors.logo = 'Business logo must be at most 2 MB.';

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
      // File inputs are visually hidden, so focusing them scrolls nowhere useful.
      if (first && first.type !== 'file') first.focus({ preventScroll: false });
      return first !== null;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      formError.style.display = 'none';

      if (applyErrors(validateLocally())) return;

      setBusy(submitBtn, true, 'Creating account…');
      Promise.all([readFile(fields.br_certificate), readFile(fields.logo)]).then(function (files) {
        return EquipifyApi.post('/auth/register/renting-party', {
          business_name: fields.business_name.value.trim(),
          owner_name: fields.owner_name.value.trim(),
          reg_no: fields.reg_no.value.trim(),
          email: fields.email.value.trim(),
          phone: fields.phone.value.trim(),
          district: fields.district.value,
          address: fields.address.value.trim(),
          password: passwordInput.value,
          confirm_password: confirmInput.value,
          br_certificate: files[0],
          logo: files[1],
          terms: fields.terms.checked
        });
      }).then(function (res) {
        if (res.ok) {
          window.location.href = AFTER_REGISTER;
          return;
        }
        setBusy(submitBtn, false);
        if (!applyErrors(res.fields)) {
          showFormError(formError, res.error);
        }
      }, function () {
        setBusy(submitBtn, false);
        showFormError(formError, 'Could not read the selected file. Please choose it again.');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLoginPage();
    initRegisterPage();
  });
})();
