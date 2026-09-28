/* ==========================================================================
   Equipify — Reset Password

   Reached from the link in the reset email, which carries ?token=<64 hex>.

   The page asks GET /auth/reset-password?token= before showing anything, so a
   dead link says so up front instead of letting someone type a new password
   and only then fail. On success the user is NOT signed in: they are sent to
   the login page for their own role, which is the role the server reports for
   the token, not anything the URL claimed.
   ========================================================================== */

(function () {
  'use strict';

  var REDIRECT_DELAY_MS = 2500;

  var token = new URLSearchParams(window.location.search).get('token') || '';

  var checkingStep = document.getElementById('checkingStep');
  var deadStep     = document.getElementById('deadStep');
  var formStep     = document.getElementById('formStep');
  var doneStep     = document.getElementById('doneStep');

  var deadMessage  = document.getElementById('deadMessage');
  var accountLine  = document.getElementById('accountLine');
  var doneMessage  = document.getElementById('doneMessage');
  var redirectNote = document.getElementById('redirectNote');
  var goToLogin    = document.getElementById('goToLogin');

  var form       = document.getElementById('resetForm');
  var passwordIn = document.getElementById('password');
  var confirmIn  = document.getElementById('confirmPassword');
  var passwordErr = document.getElementById('passwordError');
  var confirmErr  = document.getElementById('confirmError');
  var formErr     = document.getElementById('formError');
  var submitBtn   = document.getElementById('submitBtn');

  var strengthBars  = document.querySelectorAll('.password-strength-bar');
  var strengthLabel = document.getElementById('strengthLabel');

  EquipifyAuth.initPasswordToggle(document.getElementById('passwordToggle'), passwordIn);
  EquipifyAuth.initPasswordToggle(document.getElementById('confirmToggle'), confirmIn);

  // Carry the portal hint through to "Request a new link", so that page can
  // still offer the right "Back to login".
  var portalHint = EquipifyPortals.fromQuery();
  if (portalHint) {
    document.getElementById('requestAgain').href =
      '../Forgot Password/index.html?portal=' + encodeURIComponent(portalHint);
  }

  // ---------- Is the link still good? ----------
  // A token that is not 64 hex characters cannot be one we issued, so say so
  // without a round trip.
  if (!/^[0-9a-f]{64}$/.test(token)) {
    showDead('That reset link is not valid. Request a new one and try again.');
  } else {
    EquipifyApi.query('/auth/reset-password', { token: token }).then(function (res) {
      if (!res.ok) {
        showDead(res.error);
        return;
      }
      accountLine.textContent =
        'For ' + res.data.email + ' (' + EquipifyPortals.label(res.data.role) + ').';
      show(formStep);
      passwordIn.focus();
    });
  }

  // ---------- Live feedback ----------
  passwordIn.addEventListener('input', function () {
    EquipifyAuth.clearFieldError(passwordIn, passwordErr);
    formErr.style.display = 'none';
    EquipifyAuth.updateStrengthMeter(passwordIn.value, strengthBars, strengthLabel);
    if (confirmIn.value !== '') {
      EquipifyAuth.checkPasswordsMatch(passwordIn, confirmIn, confirmErr);
    }
  });

  confirmIn.addEventListener('input', function () {
    EquipifyAuth.clearFieldError(confirmIn, confirmErr);
    formErr.style.display = 'none';
  });
  confirmIn.addEventListener('blur', function () {
    EquipifyAuth.checkPasswordsMatch(passwordIn, confirmIn, confirmErr);
  });

  // ---------- Submit ----------
  form.addEventListener('submit', function (event) {
    event.preventDefault();

    // Mirrors Validator::password() on the server, so the common mistakes are
    // caught without a round trip. The server still decides.
    var password = passwordIn.value;
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      fieldError(passwordIn, passwordErr,
        'Password must be at least 8 characters and include a letter and a number.');
      return;
    }
    if (password !== confirmIn.value) {
      fieldError(confirmIn, confirmErr, 'Passwords do not match.');
      return;
    }

    setBusy(true);
    EquipifyApi.post('/auth/reset-password', {
      token: token,
      password: password,
      confirm_password: confirmIn.value
    }).then(function (res) {
      setBusy(false);

      if (!res.ok) {
        // 410 means the link died between loading the page and submitting.
        if (res.status === 410) {
          showDead(res.error);
          return;
        }
        if (res.fields && res.fields.password) {
          fieldError(passwordIn, passwordErr, res.fields.password);
          return;
        }
        if (res.fields && res.fields.confirm_password) {
          fieldError(confirmIn, confirmErr, res.fields.confirm_password);
          return;
        }
        setText(formErr, res.error);
        formErr.style.display = 'flex';
        return;
      }

      finish(res.data);
    });
  });

  // ---------- Steps ----------
  function finish(data) {
    // The role comes from the token's account, never from the URL.
    var loginUrl = EquipifyPortals.loginUrl(data.role);

    doneMessage.textContent = data.message;
    goToLogin.href = loginUrl;
    redirectNote.textContent =
      'Taking you to the ' + EquipifyPortals.label(data.role) + ' login page…';

    show(doneStep);
    goToLogin.focus();
    window.setTimeout(function () {
      window.location.replace(loginUrl);
    }, REDIRECT_DELAY_MS);
  }

  function showDead(message) {
    deadMessage.textContent = message;
    show(deadStep);
  }

  /** Exactly one of the four sections is ever visible. */
  function show(step) {
    [checkingStep, deadStep, formStep, doneStep].forEach(function (section) {
      section.hidden = section !== step;
    });
  }

  function fieldError(input, errorEl, message) {
    setText(errorEl, message);
    EquipifyAuth.showFieldError(input, errorEl);
    input.focus();
  }

  /** Server text is written as text, never parsed as HTML. */
  function setText(errorEl, message) {
    errorEl.querySelector('.error-text').textContent = message;
  }

  function setBusy(busy) {
    if (busy && !submitBtn.dataset.label) {
      submitBtn.dataset.label = submitBtn.textContent;
    }
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? 'Updating…' : submitBtn.dataset.label;
  }
})();
