/* ==========================================================================
   Equipify — Freelance Worker / Complaints

   Covers both complaint requirements: submitting one against a customer, and
   tracking it afterwards. GET /freelancer/complaints is searched, filtered by
   status and paged on the server; POST /freelancer/complaints validates the
   form the way the real endpoint will.

   Complaints have no table in the schema yet, so the list is placeholder data
   and a submission is validated but not stored.
   ========================================================================== */

(function () {
  'use strict';

  var list = EquipifyList.create({
    endpoint: '/freelancer/complaints',
    container: document.querySelector('#complaintTable tbody'),
    searchInput: document.getElementById('complaintSearch'),
    filters: { status: document.getElementById('statusFilter') },
    pager: document.getElementById('complaintPager'),
    countLabel: document.getElementById('complaintCount'),
    columns: 6,
    emptyMessage: "You haven't raised any complaints.",
    renderItem: complaintRow
  });

  function complaintRow(complaint) {
    var tr = document.createElement('tr');

    tr.appendChild(Portal.cell(complaint.reference, { strong: true }));

    var subject = document.createElement('td');
    subject.appendChild(document.createTextNode(complaint.subject));
    subject.appendChild(Portal.element('div', 'cell-muted', complaint.details));
    tr.appendChild(subject);

    tr.appendChild(Portal.cell(complaint.against_name + ' · ' + complaint.job_ref));
    tr.appendChild(Portal.cell(Portal.date(complaint.submitted_at), { className: 'cell-muted' }));
    tr.appendChild(Portal.cellWith(Portal.badge('complaint', complaint.status)));
    tr.appendChild(Portal.cell(
      complaint.resolution || 'Last updated ' + Portal.date(complaint.updated_at),
      { className: 'cell-muted' }
    ));

    return tr;
  }

  // ---------- Submit ----------
  var form = document.getElementById('complaintForm');
  var formError = document.getElementById('complaintFormError');
  var submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    formError.hidden = true;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    submitBtn.disabled = true;

    EquipifyApi.post('/freelancer/complaints', {
      against_name: form.elements.against_name.value,
      job_ref: form.elements.job_ref.value,
      subject: form.elements.subject.value,
      details: form.elements.details.value
    }).then(function (res) {
      submitBtn.disabled = false;
      if (!res.ok) {
        Portal.showFormError(formError, res);
        return;
      }
      window.showToast(form.dataset.successMessage);
      Portal.closeModal(form.closest('.modal-backdrop'));
      form.reset();
      list.reload();
    });
  });
})();
