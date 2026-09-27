/* ==========================================================================
   Equipify — Admin account-status dialog (vanilla JS, needs shared/api.js)
   Exposes window.EquipifyAccountStatus.

   The Area Managers and Complaints & Users pages both let an admin suspend,
   ban, deactivate or reactivate an account through
   POST /admin/users/{id}/status. Each page carries the same #statusModal
   markup (a #statusForm with a #statusSelect, a #statusReason inside
   #statusReasonField, a #statusFormError and a #statusModalName line); this
   file wires it once. The options a page offers are simply the <option>s in
   its own #statusSelect.

   A reason is required for anything but Active; the server checks the same.
   ========================================================================== */

(function () {
  'use strict';

  var LABELS = {
    active: 'Active',
    suspended: 'Suspended',
    banned: 'Banned',
    deactivated: 'Deactivated'
  };

  var TONES = {
    active: 'active',
    suspended: 'pending',
    banned: 'rejected',
    deactivated: 'rejected'
  };

  /** A .badge-status span for an account_status value. */
  function badge(status) {
    var span = document.createElement('span');
    span.className = 'badge-status badge-status--' + (TONES[status] || 'draft');
    span.textContent = LABELS[status] || status;
    return span;
  }

  var modal = document.getElementById('statusModal');
  var form = document.getElementById('statusForm');
  var select = document.getElementById('statusSelect');
  var reason = document.getElementById('statusReason');
  var reasonField = document.getElementById('statusReasonField');
  var formError = document.getElementById('statusFormError');
  var nameLine = document.getElementById('statusModalName');

  var current = null; // { user, onSaved }

  function syncReason() {
    var needsReason = select.value !== 'active';
    reasonField.hidden = !needsReason;
    reason.required = needsReason;
  }

  function close() {
    modal.classList.remove('is-open');
    current = null;
  }

  /**
   * Opens the dialog for one user row ({user_id, full_name, account_status}).
   * onSaved(updatedRow) runs after the server accepts the change.
   */
  function open(user, onSaved) {
    if (!modal) return;
    current = { user: user, onSaved: onSaved };
    form.reset();
    formError.hidden = true;
    nameLine.textContent = user.full_name + ' · currently ' + (LABELS[user.account_status] || user.account_status);
    // Preselect the most likely change: reactivate an inactive account,
    // otherwise the first non-active option this page offers.
    var target = user.account_status === 'active' ? '' : 'active';
    if (!target) {
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value !== 'active') { target = select.options[i].value; break; }
      }
    }
    select.value = target;
    syncReason();
    modal.classList.add('is-open');
    select.focus();
  }

  if (form) {
    select.addEventListener('change', syncReason);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!current) return;
      formError.hidden = true;
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      var saving = current;
      EquipifyApi.post('/admin/users/' + encodeURIComponent(saving.user.user_id) + '/status', {
        status: select.value,
        reason: select.value === 'active' ? '' : reason.value
      }).then(function (res) {
        submitBtn.disabled = false;
        if (!res.ok) {
          var details = Object.keys(res.fields).map(function (k) { return res.fields[k]; });
          formError.textContent = details.length ? details.join(' ') : res.error;
          formError.hidden = false;
          return;
        }
        close();
        if (window.showToast) {
          window.showToast(res.data.full_name + ' is now ' + (LABELS[res.data.account_status] || res.data.account_status).toLowerCase() + '.');
        }
        if (saving.onSaved) saving.onSaved(res.data);
      });
    });
  }

  window.EquipifyAccountStatus = {
    open: open,
    badge: badge,
    label: function (status) { return LABELS[status] || status; }
  };
})();
