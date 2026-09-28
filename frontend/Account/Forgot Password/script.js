/* ==========================================================================
   Equipify — Forgot Password

   Posts an email address to POST /auth/forgot-password and swaps to a
   "check your email" panel.

   The server answers identically whether or not the address has an account,
   so that it never confirms who is registered. This page must keep that
   promise: it shows the same panel every time and never says "no account
   found". The only error it can show is a malformed address (422).
   ========================================================================== */

(function () {
  'use strict';

  var form      = document.getElementById('forgotForm');
  var emailIn   = document.getElementById('email');
  var emailErr  = document.getElementById('emailError');
  var formErr   = document.getElementById('formError');
  var submitBtn = document.getElementById('submitBtn');

  var requestStep = document.getElementById('requestStep');
  var sentStep    = document.getElementById('sentStep');
  var sentMessage = document.getElementById('sentMessage');
  var resendBtn   = document.getElementById('resendBtn');

  // The login page to offer as "Back to login". Which one depends on where
  // the user came from: every login page links here with ?portal=<role>.
  document.getElementById('backToLogin').href =
    EquipifyPortals.loginUrl(EquipifyPortals.fromQuery());

  emailIn.addEventListener('input', function () {
    EquipifyAuth.clearFieldError(emailIn, emailErr);
    formErr.style.display = 'none';
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var email = emailIn.value.trim();
    if (email === '' || !emailIn.checkValidity()) {
      showFieldError('Enter a valid email address.');
      return;
    }

    setBusy(true);
    EquipifyApi.post('/auth/forgot-password', { email: email }).then(function (res) {
      setBusy(false);

      if (!res.ok) {
        if (res.fields && res.fields.email) {
          showFieldError(res.fields.email);
        } else {
          setText(formErr, res.error);
          formErr.style.display = 'flex';
        }
        return;
      }

      sentMessage.textContent = res.data.message;
      requestStep.hidden = true;
      sentStep.hidden = false;
      resendBtn.focus();
    });
  });

  resendBtn.addEventListener('click', function () {
    sentStep.hidden = true;
    requestStep.hidden = false;
    emailIn.value = '';
    emailIn.focus();
  });

  function showFieldError(message) {
    setText(emailErr, message);
    EquipifyAuth.showFieldError(emailIn, emailErr);
    emailIn.focus();
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
    submitBtn.textContent = busy ? 'Sending…' : submitBtn.dataset.label;
  }
})();
