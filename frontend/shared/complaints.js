/* ==========================================================================
   Equipify — The complaint form + "My complaints" list, for every role
   Adds EquipifyComplaints.initPage() (needs shared/list.js and
   shared/complaints-mock.js first).

   There is exactly one complaint form on the platform, and it is built here.
   Every role's Complaints page (Customer, Renting Party, Freelance Worker,
   Technician, Delivery Personnel) carries only the list markup and an empty
   <div id="complaintFormMount">. Its own script.js is just
   EquipifyComplaints.initPage(). The fields never change between roles. Only
   the choices do:

     Complaint against   the roles in EquipifyComplaints.RULES for this role
                         (fixed and disabled when there is only one)
     Category            the CATEGORIES that apply to the chosen party,
                         refreshed whenever "Complaint against" changes

   The page provides:
     body[data-require-auth]   the signed-in role
     #newComplaintBtn          opens the form
     #complaintTable tbody, #complaintSearch, #statusFilter, #categoryFilter,
     #complaintPager, #complaintCount, #toast

   Everything is built with createElement/textContent; no innerHTML.
   ========================================================================== */

(function () {
  'use strict';

  var C = window.EquipifyComplaints;

  // What the "name" field asks for, by the party being complained about.
  var NAME_LABELS = {
    customer: 'Customer or company name',
    renting_party: 'Business name',
    freelance_worker: 'Operator name',
    delivery_personnel: 'Driver name'
  };

  // ---------- small DOM helpers ----------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(name) {
    var span = el('span', 'icon icon-sm', name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function option(value, label) {
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    return opt;
  }

  function badge(tone, label) {
    return el('span', 'badge-status badge-status--' + tone, label);
  }

  function formatDate(value) {
    var parsed = new Date(value);
    if (isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function toast(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    var node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.classList.remove('is-visible'); }, 2600);
  }

  /** The signed-in user's name as the shell shows it, once session.js has filled it. */
  function complainantName() {
    var node = document.querySelector('[data-display-name]') || document.querySelector('[data-user-name]');
    var name = node ? node.textContent.trim() : '';
    return name && name !== 'Loading…' ? name : '';
  }

  // ---------- the form ----------

  /** One labelled field: returns { wrap, input, error }. */
  function field(opts) {
    var wrap = el('div', 'field' + (opts.full ? ' field--full' : ''));
    var label = el('label', 'field-label', opts.label);
    label.htmlFor = opts.id;
    wrap.appendChild(label);

    var input = document.createElement(opts.tag || 'input');
    input.className = 'input-standard';
    input.id = opts.id;
    input.name = opts.name;
    if (opts.maxLength) input.maxLength = opts.maxLength;
    if (opts.required) input.required = true;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.tag === 'textarea') input.rows = 5;
    wrap.appendChild(input);

    if (opts.hint) wrap.appendChild(el('span', 'field-hint', opts.hint));

    var error = el('span', 'field-error-text');
    error.id = opts.id + 'Error';
    error.hidden = true;
    wrap.appendChild(error);
    input.setAttribute('aria-describedby', error.id);

    return { wrap: wrap, input: input, error: error };
  }

  function buildForm(mount) {
    var backdrop = el('div', 'modal-backdrop');
    backdrop.id = 'complaintModal';

    var modal = el('div', 'modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'complaintModalTitle');
    backdrop.appendChild(modal);

    var head = el('div', 'modal-head');
    var title = el('h3', 'type-headline-sm', 'Submit a complaint');
    title.id = 'complaintModalTitle';
    head.appendChild(title);
    var closeBtn = el('button', 'modal-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.appendChild(icon('close'));
    head.appendChild(closeBtn);
    modal.appendChild(head);

    modal.appendChild(el('p', 'complaint-intro',
      'Choose who the complaint is about and a category, then tell us what happened.'));

    var form = document.createElement('form');
    form.id = 'complaintForm';
    form.noValidate = true;

    var formError = el('p', 'form-error');
    formError.setAttribute('role', 'alert');
    formError.hidden = true;
    form.appendChild(formError);

    var grid = el('div', 'form-grid');
    grid.style.marginTop = '18px';

    var fields = {
      against_role: field({ id: 'complaintAgainstRole', name: 'against_role', label: 'Complaint against', tag: 'select', required: true }),
      against_name: field({ id: 'complaintAgainstName', name: 'against_name', label: 'Name', maxLength: 150, required: true }),
      category: field({ id: 'complaintCategory', name: 'category', label: 'Category', tag: 'select', required: true }),
      reference: field({ id: 'complaintReference', name: 'reference', label: 'Related reference (optional)', maxLength: 30, placeholder: 'e.g. RR-1011, DL-320 or JOB-3112' }),
      subject: field({ id: 'complaintSubject', name: 'subject', label: 'Subject', maxLength: 150, required: true, full: true, placeholder: 'A short summary' }),
      details: field({
        id: 'complaintDetails', name: 'details', label: 'What happened?', tag: 'textarea', maxLength: 2000,
        required: true, full: true, placeholder: 'Dates, the site, who you dealt with, and what went wrong.',
        hint: 'An admin reads every complaint. You can follow its status on this page.'
      })
    };
    Object.keys(fields).forEach(function (key) { grid.appendChild(fields[key].wrap); });
    form.appendChild(grid);

    var actions = el('div', 'modal-actions');
    var cancelBtn = el('button', 'btn-outline', 'Cancel');
    cancelBtn.type = 'button';
    var submitBtn = el('button', 'btn-primary', 'Submit complaint');
    submitBtn.type = 'submit';
    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    form.appendChild(actions);

    modal.appendChild(form);
    mount.appendChild(backdrop);

    return {
      backdrop: backdrop, form: form, formError: formError, fields: fields,
      closeBtn: closeBtn, cancelBtn: cancelBtn, submitBtn: submitBtn
    };
  }

  // ---------- page ----------
  function initPage() {
    var role = document.body.getAttribute('data-require-auth');
    var againstRoles = C.RULES[role];
    var mount = document.getElementById('complaintFormMount');
    if (!againstRoles || !mount) return;

    var ui = buildForm(mount);
    var f = ui.fields;

    // "Complaint against": this role's allowed parties.
    againstRoles.forEach(function (r) { f.against_role.input.appendChild(option(r, C.ROLE_LABELS[r])); });
    f.against_role.input.disabled = againstRoles.length === 1;

    function refreshChoices() {
      var against = f.against_role.input.value;
      f.against_name.wrap.querySelector('label').textContent = NAME_LABELS[against] || 'Name';
      f.against_name.input.placeholder = NAME_LABELS[against] || '';

      var previous = f.category.input.value;
      f.category.input.textContent = '';
      f.category.input.appendChild(option('', 'Choose a category'));
      C.categoriesFor(against).forEach(function (c) {
        f.category.input.appendChild(option(c.value, c.label));
      });
      // Keep the chosen category if it still applies to the new party.
      f.category.input.value = previous;
      if (f.category.input.value !== previous) f.category.input.value = '';
    }
    f.against_role.input.addEventListener('change', refreshChoices);

    function clearErrors() {
      ui.formError.hidden = true;
      Object.keys(f).forEach(function (key) {
        f[key].error.hidden = true;
        f[key].input.removeAttribute('aria-invalid');
      });
    }

    function showErrors(res) {
      var first = null;
      Object.keys(res.fields || {}).forEach(function (key) {
        if (!f[key]) return;
        f[key].error.textContent = res.fields[key];
        f[key].error.hidden = false;
        f[key].input.setAttribute('aria-invalid', 'true');
        if (!first) first = f[key].input;
      });
      ui.formError.textContent = res.error;
      ui.formError.hidden = false;
      if (first) first.focus();
    }

    var opener = null;
    function openForm() {
      opener = document.activeElement;
      ui.form.reset();
      f.against_role.input.value = againstRoles[0];
      refreshChoices();
      clearErrors();
      ui.backdrop.classList.add('is-open');
      (againstRoles.length > 1 ? f.against_role.input : f.against_name.input).focus();
    }

    function closeForm() {
      ui.backdrop.classList.remove('is-open');
      if (opener && opener.focus) opener.focus();
    }

    var newBtn = document.getElementById('newComplaintBtn');
    if (newBtn) newBtn.addEventListener('click', openForm);
    ui.closeBtn.addEventListener('click', closeForm);
    ui.cancelBtn.addEventListener('click', closeForm);
    ui.backdrop.addEventListener('click', function (event) {
      if (event.target === ui.backdrop) closeForm();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && ui.backdrop.classList.contains('is-open')) closeForm();
    });

    // ---------- list ----------
    var statusFilter = document.getElementById('statusFilter');
    var categoryFilter = document.getElementById('categoryFilter');

    if (statusFilter) {
      Object.keys(C.STATUSES).forEach(function (key) {
        statusFilter.appendChild(option(key, C.STATUSES[key].label));
      });
    }
    if (categoryFilter) {
      // Only the categories this role can ever pick.
      C.CATEGORIES.filter(function (c) {
        return againstRoles.some(function (r) { return c.appliesTo.indexOf(r) !== -1; });
      }).forEach(function (c) { categoryFilter.appendChild(option(c.value, c.label)); });
    }

    var list = EquipifyList.create({
      source: function (params) { return C.mine(role, params); },
      container: document.querySelector('#complaintTable tbody'),
      searchInput: document.getElementById('complaintSearch'),
      filters: { status: statusFilter, category: categoryFilter },
      pager: document.getElementById('complaintPager'),
      countLabel: document.getElementById('complaintCount'),
      columns: 7,
      emptyMessage: "You haven't raised any complaints.",
      renderItem: complaintRow
    });

    function complaintRow(c) {
      var tr = document.createElement('tr');

      var ref = el('td');
      ref.appendChild(el('strong', null, c.reference));
      tr.appendChild(ref);

      var subject = el('td');
      subject.appendChild(document.createTextNode(c.subject));
      subject.appendChild(el('div', 'cell-muted', c.details));
      tr.appendChild(subject);

      var against = el('td');
      against.appendChild(document.createTextNode(c.against_name));
      against.appendChild(el('div', 'cell-muted',
        C.ROLE_LABELS[c.against_role] + (c.related_ref ? ' · ' + c.related_ref : '')));
      tr.appendChild(against);

      tr.appendChild(el('td', null, C.categoryLabel(c.category)));
      tr.appendChild(el('td', 'cell-muted', formatDate(c.submitted_at)));

      var status = el('td');
      var s = C.STATUSES[c.status] || { tone: 'draft', label: c.status };
      status.appendChild(badge(s.tone, s.label));
      tr.appendChild(status);

      tr.appendChild(el('td', 'cell-muted', c.resolution || 'Last updated ' + formatDate(c.updated_at)));
      return tr;
    }

    // ---------- submit ----------
    ui.form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearErrors();

      ui.submitBtn.disabled = true;
      C.submit(role, {
        against_role: f.against_role.input.value,
        against_name: f.against_name.input.value,
        category: f.category.input.value,
        reference: f.reference.input.value,
        subject: f.subject.input.value,
        details: f.details.input.value
      }, complainantName()).then(function (res) {
        ui.submitBtn.disabled = false;
        if (!res.ok) {
          showErrors(res);
          return;
        }
        closeForm();
        toast('Complaint ' + res.data.reference + ' submitted. An admin will take it from here.');
        if (list) list.reset();
      });
    });
  }

  C.initPage = initPage;
})();
