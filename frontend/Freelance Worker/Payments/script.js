/* ==========================================================================
   Equipify — Freelance Worker / Payments

   GET /freelancer/payments returns the usual paged envelope plus a `summary`
   covering the whole account, so the three tiles stay correct while the table
   below is filtered or paged. GET /freelancer/invoices/{id} backs the invoice
   modal.

   Neither payments nor invoices have tables in the schema yet, so both are
   served as placeholder data in the shape the real endpoints will use.
   ========================================================================== */

(function () {
  'use strict';

  EquipifyList.create({
    endpoint: '/freelancer/payments',
    container: document.querySelector('#paymentTable tbody'),
    searchInput: document.getElementById('paymentSearch'),
    filters: {
      status: document.getElementById('statusFilter'),
      from: document.getElementById('fromFilter'),
      to: document.getElementById('toFilter')
    },
    pager: document.getElementById('paymentPager'),
    countLabel: document.getElementById('paymentCount'),
    columns: 7,
    emptyMessage: 'No payments match these filters.',
    renderItem: paymentRow,
    onLoad: function (data) {
      // Account totals, not page totals, so they don't move as you page.
      document.getElementById('paidTotal').textContent = Portal.money(data.summary.paid_total);
      document.getElementById('pendingTotal').textContent = Portal.money(data.summary.pending_total);
      document.getElementById('failedCount').textContent = data.summary.failed_count;
    }
  });

  function paymentRow(payment) {
    var tr = document.createElement('tr');

    tr.appendChild(Portal.cell(payment.reference, { strong: true }));

    var description = document.createElement('td');
    description.appendChild(document.createTextNode(payment.description));
    description.appendChild(Portal.element('div', 'cell-muted', payment.job_ref));
    tr.appendChild(description);

    tr.appendChild(Portal.cell(Portal.date(payment.paid_at), { className: 'cell-muted' }));
    tr.appendChild(Portal.cell(payment.method));
    tr.appendChild(Portal.cellWith(Portal.badge('payment', payment.status)));
    tr.appendChild(Portal.cell(Portal.money(payment.amount_lkr), { strong: true }));
    tr.appendChild(Portal.cellWith(Portal.button('View', 'btn-outline btn-sm', function () {
      openInvoice(payment);
    })));

    return tr;
  }

  // ---------- Invoice modal ----------
  function openInvoice(payment) {
    var details = document.getElementById('invoiceDetails');
    details.textContent = '';
    details.appendChild(Portal.element('p', 'list-state', 'Loading…'));
    document.getElementById('invoiceNumber').textContent = 'Invoice';
    Portal.openModal('invoiceModal');

    EquipifyApi.get('/freelancer/invoices/' + payment.payment_id).then(function (res) {
      details.textContent = '';
      if (!res.ok) {
        details.appendChild(Portal.element('p', 'list-state list-state--error', res.error));
        return;
      }
      var invoice = res.data;
      document.getElementById('invoiceNumber').textContent = invoice.number;

      row(details, 'Job', invoice.job_ref);
      row(details, 'Description', invoice.description);
      row(details, 'Issued', Portal.date(invoice.issued_on));
      row(details, 'Subtotal', Portal.money(invoice.subtotal_lkr));
      row(details, 'Platform fee', '− ' + Portal.money(invoice.platform_fee_lkr));
      row(details, 'Net to you', Portal.money(invoice.net_lkr));
      row(details, 'Status', Portal.label('payment', invoice.status));
    });
  }

  function row(container, term, value) {
    var wrap = Portal.element('div', 'detail-row');
    wrap.appendChild(Portal.element('dt', null, term));
    wrap.appendChild(Portal.element('dd', null, value));
    container.appendChild(wrap);
  }
})();
