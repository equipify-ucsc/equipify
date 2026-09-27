/* ==========================================================================
   Equipify — Document Verification
   Live from the credential_docs table:
     GET  /admin/documents              paged list (?q=&role=&status=) + tile counts
     GET  /admin/documents/{id}/file    the stored PDF/image, opened in a new tab
     POST /admin/documents/{id}/verify
     POST /admin/documents/{id}/reject  {reason}
   Verifying or rejecting a renting party's business registration also sets
   the party's own verification status (see DocumentVerificationService).
   Needs shared/api.js and shared/list.js. Rows use createElement/textContent.
   ========================================================================== */

(function () {
  'use strict';

  var ROLE_LABELS = {
    renting_party: 'Renting party',
    freelance_worker: 'Freelance worker',
    maintenance_tech: 'Technician',
    delivery_personnel: 'Delivery personnel',
    customer: 'Customer'
  };

  var DOC_TYPES = {
    nic: 'National ID (NIC)',
    driving_license: 'Driving licence',
    business_registration: 'Business registration',
    professional_certificate: 'Professional certificate',
    other: 'Other document'
  };

  var STATUSES = {
    pending: { label: 'Pending', tone: 'pending' },
    verified: { label: 'Verified', tone: 'active' },
    rejected: { label: 'Rejected', tone: 'rejected' }
  };

  // ---------- Toast helper ----------
  var toastTimer;
  window.showToast = function (message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2600);
  };

  // ---------- Modal close ----------
  function closeModal(modal) {
    if (modal) modal.classList.remove('is-open');
  }
  document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeModal(btn.closest('.modal-backdrop')); });
  });
  document.querySelectorAll('.modal-backdrop').forEach(function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal(modal);
    });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.modal-backdrop.is-open').forEach(closeModal);
  });

  // ---------- Helpers ----------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatDate(value) {
    if (!value) return '';
    var parsed = new Date(String(value).replace(' ', 'T'));
    if (isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function setStat(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function button(className, label, onClick) {
    var btn = el('button', className, label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ---------- List ----------
  var list = EquipifyList.create({
    endpoint: '/admin/documents',
    container: document.querySelector('#docsTable tbody'),
    searchInput: document.getElementById('docSearch'),
    filters: {
      role: document.getElementById('docRoleFilter'),
      status: document.getElementById('docStatusFilter')
    },
    pager: document.getElementById('docPager'),
    countLabel: document.getElementById('docCount'),
    perPage: 10,
    columns: 6,
    emptyMessage: 'No documents match these filters.',
    renderItem: docRow,
    onLoad: function (data) {
      var summary = data.summary || {};
      setStat('statPending', summary.pending || 0);
      setStat('statVerifiedToday', summary.verified_today || 0);
      setStat('statRejected', summary.rejected || 0);
    }
  });

  function docRow(doc) {
    var tr = document.createElement('tr');

    var applicant = el('td');
    applicant.appendChild(el('strong', null, doc.business_name || doc.full_name));
    if (doc.business_name) applicant.appendChild(el('span', 'cell-muted', doc.full_name));
    tr.appendChild(applicant);

    tr.appendChild(el('td', null, ROLE_LABELS[doc.role] || doc.role));
    tr.appendChild(el('td', null, DOC_TYPES[doc.doc_type] || doc.doc_type));
    tr.appendChild(el('td', null, formatDate(doc.submitted_at)));

    var status = el('td');
    var s = STATUSES[doc.verification_status] || STATUSES.pending;
    status.appendChild(el('span', 'badge-status badge-status--' + s.tone, s.label));
    if (doc.verification_status === 'rejected' && doc.rejection_reason) {
      status.appendChild(el('span', 'cell-muted', doc.rejection_reason));
    }
    tr.appendChild(status);

    var actions = el('td', 'table-actions');
    // A plain link, so the browser opens the file itself in a new tab with
    // the admin's session cookie; the endpoint streams it inline.
    var view = el('a', 'btn-outline btn-sm', 'View document');
    view.href = EquipifyApi.url('/admin/documents/' + encodeURIComponent(doc.credential_doc_id) + '/file');
    view.target = '_blank';
    view.rel = 'noopener';
    actions.appendChild(view);

    if (doc.verification_status === 'pending') {
      actions.appendChild(button('btn-primary btn-sm', 'Approve', function (event) {
        approve(doc, event.currentTarget);
      }));
      actions.appendChild(button('btn-danger btn-sm', 'Reject', function () {
        openReject(doc);
      }));
    }
    tr.appendChild(actions);
    return tr;
  }

  function docName(doc) {
    return (DOC_TYPES[doc.doc_type] || doc.doc_type) + ' · ' + (doc.business_name || doc.full_name);
  }

  // ---------- Approve ----------
  function approve(doc, btn) {
    btn.disabled = true;
    EquipifyApi.post('/admin/documents/' + encodeURIComponent(doc.credential_doc_id) + '/verify').then(function (res) {
      if (!res.ok) {
        btn.disabled = false;
        window.showToast(res.error);
        list.reload();
        return;
      }
      window.showToast('Document verified: ' + docName(doc) + '.');
      list.reload();
    });
  }

  // ---------- Reject ----------
  var rejectModal = document.getElementById('rejectModal');
  var rejectForm = document.getElementById('rejectForm');
  var rejectError = document.getElementById('rejectFormError');
  var rejecting = null;

  function openReject(doc) {
    rejecting = doc;
    rejectForm.reset();
    rejectError.hidden = true;
    document.getElementById('rejectModalMeta').textContent = docName(doc);
    rejectModal.classList.add('is-open');
    rejectForm.elements.reason.focus();
  }

  rejectForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!rejecting) return;
    rejectError.hidden = true;
    if (!rejectForm.checkValidity()) {
      rejectForm.reportValidity();
      return;
    }
    var submitBtn = rejectForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    var doc = rejecting;
    EquipifyApi.post('/admin/documents/' + encodeURIComponent(doc.credential_doc_id) + '/reject', {
      reason: rejectForm.elements.reason.value
    }).then(function (res) {
      submitBtn.disabled = false;
      if (!res.ok) {
        var details = Object.keys(res.fields).map(function (k) { return res.fields[k]; });
        rejectError.textContent = details.length ? details.join(' ') : res.error;
        rejectError.hidden = false;
        return;
      }
      closeModal(rejectModal);
      rejecting = null;
      window.showToast('Document rejected: ' + docName(doc) + '.');
      list.reload();
    });
  });
})();
