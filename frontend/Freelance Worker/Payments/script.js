/* ==========================================================================
   Equipify — Freelance Worker / Payments

   GET /freelancer/payments returns the usual paged envelope plus a `summary`
   covering the whole account, so the three tiles stay correct while the table
   below is filtered or paged. GET /freelancer/invoices/{id} backs the invoice
   modal.

   Neither payments nor invoices have tables in the schema yet, so both are
   served as placeholder data in the shape the real endpoints will use.

   Payout methods, lower down this file, are real: /freelancer/payout-methods
   is backed by the payout_methods table. The account details are encrypted on
   the server and never sent back, so a saved method only ever shows as its
   name, its provider and the last four digits.
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

  // ==========================================================================
  // Payout methods
  // ==========================================================================

  var payoutList = document.getElementById('payoutList');
  var payoutForm = document.getElementById('payoutForm');
  var payoutError = document.getElementById('payoutFormError');
  var providerSelect = document.getElementById('payoutProvider');
  var payoutSubmit = payoutForm.querySelector('button[type="submit"]');

  // provider value -> category, filled from the server's catalogue. The page
  // does not hardcode the list: the same source that validates a submission is
  // the one that builds the picker, so the two cannot drift apart.
  var providerCategory = {};

  // How many methods the account may hold, from the list response.
  var maxMethods = 0;

  loadProviders();
  loadMethods();

  // ---------- The picker ----------
  function loadProviders() {
    EquipifyApi.get('/freelancer/payout-providers').then(function (res) {
      providerSelect.textContent = '';
      if (!res.ok) {
        providerSelect.appendChild(new Option(res.error, ''));
        return;
      }

      providerSelect.appendChild(new Option('Select a method', ''));
      res.data.categories.forEach(function (category) {
        // One <optgroup> per category, which is what turns a flat list of
        // fifteen into "Bank account / Mobile wallet / Digital wallet".
        var group = document.createElement('optgroup');
        group.label = category.label;
        category.providers.forEach(function (provider) {
          providerCategory[provider.provider] = category.category;
          group.appendChild(new Option(provider.name, provider.provider));
        });
        providerSelect.appendChild(group);
      });
    });
  }

  /**
   * Shows only the fields the chosen category needs, and marks them required
   * so the browser's own validation covers them. A hidden field must not be
   * required, or submit fails on something the user cannot see.
   */
  function showFieldsFor(category) {
    document.querySelectorAll('[data-payout-fields]').forEach(function (field) {
      var applies = category !== '' &&
        field.dataset.payoutFields.split(' ').indexOf(category) !== -1;
      field.hidden = !applies;
      var input = field.querySelector('input');
      if (input) {
        input.required = applies;
        if (!applies) input.value = '';
      }
    });
  }

  providerSelect.addEventListener('change', function () {
    showFieldsFor(providerCategory[providerSelect.value] || '');
  });

  // ---------- The list ----------
  function loadMethods() {
    payoutList.textContent = '';
    payoutList.appendChild(Portal.element('p', 'list-state list-state--loading', 'Loading…'));

    EquipifyApi.get('/freelancer/payout-methods').then(function (res) {
      if (!res.ok) {
        renderMethods(null, res.error);
        return;
      }
      maxMethods = res.data.max;
      renderMethods(res.data.items);
    });
  }

  function renderMethods(items, errorMessage) {
    payoutList.textContent = '';

    if (errorMessage) {
      payoutList.appendChild(Portal.element('p', 'list-state list-state--error', errorMessage));
      return;
    }
    if (!items.length) {
      payoutList.appendChild(Portal.element(
        'p',
        'list-state list-state--empty',
        'No payout method yet. Add one so your earnings have somewhere to go.'
      ));
      return;
    }
    items.forEach(function (method) {
      payoutList.appendChild(methodCard(method));
    });
  }

  function methodCard(method) {
    var card = Portal.element('div', 'record-card');

    var head = Portal.element('div', 'record-head');
    var titles = document.createElement('div');
    titles.appendChild(Portal.element('h3', 'record-title', method.label));
    titles.appendChild(Portal.element('p', 'record-ref', method.provider_name + ' · ' + method.category_label));
    head.appendChild(titles);
    if (method.is_default) {
      var badge = Portal.element('span', 'badge-status badge-status--active', 'Default');
      head.appendChild(badge);
    }
    card.appendChild(head);

    var meta = Portal.element('p', 'record-meta');
    if (method.unreadable) {
      // The blob would not open with the current key. Say so plainly rather
      // than showing a method with blank details that looks like it works.
      meta.appendChild(metaItem('lock', 'Details cannot be read. Remove this method and add it again.'));
    } else {
      meta.appendChild(metaItem(
        method.category === 'bank_account' ? 'account_balance' : 'smartphone',
        method.masked_account
      ));
      if (method.account_name) meta.appendChild(metaItem('person', method.account_name));
      if (method.branch) meta.appendChild(metaItem('location_on', method.branch));
    }
    card.appendChild(meta);

    var actions = Portal.element('div', 'record-actions');
    if (!method.is_default && !method.unreadable) {
      actions.appendChild(Portal.button('Make default', 'btn-outline btn-sm', function () {
        setDefault(method);
      }));
    }
    actions.appendChild(Portal.button('Remove', 'btn-outline btn-sm', function () {
      remove(method);
    }));
    card.appendChild(actions);

    return card;
  }

  function metaItem(iconName, text) {
    var span = Portal.element('span');
    span.appendChild(Portal.icon(iconName));
    span.appendChild(document.createTextNode(text));
    return span;
  }

  // ---------- Actions ----------
  function setDefault(method) {
    EquipifyApi.post('/freelancer/payout-methods/' + method.payout_method_id + '/default')
      .then(function (res) {
        if (!res.ok) {
          window.showToast(res.error);
          return;
        }
        window.showToast('Earnings will go to ' + method.label + '.');
        renderMethods(res.data.items);
      });
  }

  function remove(method) {
    // Destructive and not undoable: the account details are gone with the row,
    // because nothing on the server can read them back to restore them.
    if (!window.confirm('Remove "' + method.label + '"? You will have to enter the account details again to add it back.')) {
      return;
    }
    EquipifyApi.del('/freelancer/payout-methods/' + method.payout_method_id).then(function (res) {
      if (!res.ok) {
        window.showToast(res.error);
        return;
      }
      window.showToast(method.label + ' removed.');
      renderMethods(res.data.items);
    });
  }

  // ---------- Adding one ----------
  document.getElementById('addPayoutBtn').addEventListener('click', function () {
    if (maxMethods && payoutList.querySelectorAll('.record-card').length >= maxMethods) {
      window.showToast('You can save up to ' + maxMethods + ' payout methods. Remove one first.');
      return;
    }
    payoutError.hidden = true;
    payoutForm.reset();
    // reset() restores the checked/value state but not which fields are shown,
    // so the category-specific rows are hidden again by hand.
    showFieldsFor('');
    Portal.openModal('payoutModal');
    document.getElementById('payoutLabel').focus();
  });

  payoutForm.addEventListener('submit', function (event) {
    event.preventDefault();
    payoutError.hidden = true;

    if (!payoutForm.checkValidity()) {
      payoutForm.reportValidity();
      return;
    }
    payoutSubmit.disabled = true;

    var category = providerCategory[providerSelect.value] || '';
    var body = {
      label: payoutForm.elements.label.value,
      provider: providerSelect.value,
      account_name: payoutForm.elements.account_name.value,
      is_default: document.getElementById('payoutDefault').checked
    };
    // Only the fields the chosen category actually uses are sent, so a value
    // left behind in a hidden input can never reach the server.
    if (category === 'bank_account') {
      body.account_number = payoutForm.elements.account_number.value;
      body.branch = payoutForm.elements.branch.value;
    } else {
      body.mobile_number = payoutForm.elements.mobile_number.value;
    }

    EquipifyApi.post('/freelancer/payout-methods', body).then(function (res) {
      payoutSubmit.disabled = false;
      if (!res.ok) {
        Portal.showFormError(payoutError, res);
        return;
      }
      window.showToast(payoutForm.dataset.successMessage);
      Portal.closeModal(payoutForm.closest('.modal-backdrop'));
      payoutForm.reset();
      showFieldsFor('');
      loadMethods();
    });
  });
})();
