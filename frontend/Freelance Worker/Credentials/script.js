/* ==========================================================================
   Equipify — Freelance Worker / Credentials

   Real data throughout: the table is this worker's own rows in
   `credential_docs` (010_create_credential_docs.sql), paged and filtered by
   verification_status and doc_type on the server.

   Uploading posts the file base64-encoded inside the JSON body, the same
   shape the renting-party sign-up uses, decoded and type-sniffed by
   core/Upload.php. Stored files are never reachable by URL; only an admin
   sees them, and the row stays 'pending' until one does.
   ========================================================================== */

(function () {
  'use strict';

  var statusFilter = document.getElementById('statusFilter');
  var docTypeFilter = document.getElementById('docTypeFilter');

  // ---------- The document list ----------
  var list = EquipifyList.create({
    endpoint: '/freelancer/documents',
    container: document.querySelector('#documentTable tbody'),
    filters: { status: statusFilter, doc_type: docTypeFilter },
    pager: document.getElementById('documentPager'),
    countLabel: document.getElementById('documentCount'),
    columns: 5,
    emptyMessage: "You haven't uploaded any documents yet.",
    renderItem: documentRow,
    onLoad: function (data) {
      // "Nothing on file yet" only when the account really has no documents.
      // an empty result because of a filter is not the same thing.
      var filtered = statusFilter.value !== '' || docTypeFilter.value !== '';
      if (data.total === 0 && !filtered) {
        showBanner('empty');
      }
    }
  });

  function documentRow(doc) {
    var tr = document.createElement('tr');

    tr.appendChild(Portal.cell(Portal.label('docType', doc.doc_type), { strong: true }));
    tr.appendChild(Portal.cell(Portal.date(doc.submitted_at), { className: 'cell-muted' }));
    tr.appendChild(Portal.cellWith(Portal.badge('verification', doc.verification_status)));
    tr.appendChild(Portal.cell(
      doc.verified_at ? Portal.date(doc.verified_at) : '—',
      { className: 'cell-muted' }
    ));
    tr.appendChild(Portal.cell(doc.rejection_reason || '—', { className: 'cell-muted' }));

    return tr;
  }

  // ---------- Verification banner ----------
  var banner = document.getElementById('verificationBanner');

  var BANNER = {
    empty: {
      modifier: 'banner',
      title: 'Nothing on file yet',
      text: 'Upload your NIC and any operator licences or certificates. An admin reviews each document before your account is verified.'
    },
    pending: {
      modifier: 'banner',
      title: 'Verification in progress',
      text: "Your documents are with an admin. You can keep working while they're reviewed."
    },
    rejected: {
      modifier: 'banner banner--rejected',
      title: 'Some documents were rejected',
      text: 'Check the notes column below, then upload a corrected copy.'
    },
    verified: {
      modifier: 'banner banner--verified',
      title: "You're a verified operator",
      text: 'Your credentials have been accepted. Upload a new document whenever one expires.'
    }
  };

  function showBanner(key) {
    var entry = BANNER[key];
    if (!entry) return;
    banner.className = entry.modifier;
    document.getElementById('bannerTitle').textContent = entry.title;
    document.getElementById('bannerText').textContent = entry.text;
    banner.hidden = false;
  }

  // The account-level status lives on freelance_workers, not on the documents,
  // so it comes from the profile endpoint.
  EquipifyApi.get('/freelancer/profile').then(function (res) {
    if (res.ok) showBanner(res.data.verification_status);
  });

  // ---------- Upload ----------
  var uploadForm = document.getElementById('uploadForm');
  var uploadError = document.getElementById('uploadFormError');
  var uploadSubmit = uploadForm.querySelector('button[type="submit"]');
  var fileInput = document.getElementById('docFile');

  var MAX_BYTES = 2097152; // must match FreelanceWorkerController::MAX_UPLOAD_BYTES

  uploadForm.addEventListener('submit', function (event) {
    event.preventDefault();
    uploadError.hidden = true;

    if (!uploadForm.checkValidity()) {
      uploadForm.reportValidity();
      return;
    }
    var file = fileInput.files[0];
    if (!file) {
      fail('Choose a file to upload.');
      return;
    }
    // Checked here for a quick answer; the server checks size and real type again.
    if (file.size > MAX_BYTES) {
      fail('That file is over 2 MB. Try a smaller copy.');
      return;
    }

    uploadSubmit.disabled = true;
    uploadSubmit.textContent = 'Uploading…';

    Portal.readFileAsBase64(file).then(function (encoded) {
      return EquipifyApi.post('/freelancer/documents', {
        doc_type: uploadForm.elements.doc_type.value,
        file: encoded
      });
    }).then(function (res) {
      resetSubmit();
      if (!res.ok) {
        Portal.showFormError(uploadError, res);
        return;
      }
      window.showToast(uploadForm.dataset.successMessage);
      Portal.closeModal(uploadForm.closest('.modal-backdrop'));
      uploadForm.reset();
      showBanner('pending');
      list.reload();
    }).catch(function () {
      resetSubmit();
      fail('Could not read that file. Try a different copy.');
    });
  });

  function resetSubmit() {
    uploadSubmit.disabled = false;
    uploadSubmit.textContent = 'Upload';
  }

  function fail(message) {
    uploadError.textContent = message;
    uploadError.hidden = false;
  }
})();
