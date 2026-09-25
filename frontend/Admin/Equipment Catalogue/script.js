/* ==========================================================================
   Equipify — Admin: Equipment Catalogue
   Categories (left) -> equipment types of the selected category (right),
   add/edit modals for both, the spec-field editor inside the type modal, and
   the renting parties' new-type requests tab. Saved through the API
   (vanilla JS, no dependencies).
   ========================================================================== */

(function () {
  'use strict';

  var DATA_TYPES = [
    ['number', 'Number'],
    ['select', 'One choice'],
    ['multiselect', 'Several choices'],
    ['boolean', 'Yes / No'],
    ['text', 'Free text']
  ];

  var state = {
    categories: [],
    fieldKeys: [],
    maxFilterable: 3,
    selectedId: null,
    editingCategoryId: null,
    editingTypeId: null,
    approvingRequest: null,
    rejectingRequestId: null
  };

  // ---------- Toast ----------
  var toastTimer;
  function showToast(message) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 2600);
  }

  // ---------- Modals ----------
  function openModal(id) {
    var modal = document.getElementById(id);
    modal.classList.add('is-open');
    var first = modal.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea');
    if (first) first.focus();
  }
  function closeModal(modal) {
    modal.classList.remove('is-open');
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

  // ---------- Small DOM helpers ----------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function icon(name, cls) {
    var span = el('span', 'icon ' + (cls || 'icon-sm'), name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  function button(label, cls, onClick) {
    var b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function badge(active, activeLabel, inactiveLabel) {
    return el('span', 'badge-status badge-status--' + (active ? 'active' : 'draft'), active ? activeLabel : inactiveLabel);
  }
  function messageRow(tbody, text, columns, isError) {
    tbody.textContent = '';
    var tr = el('tr');
    var td = el('td', 'list-state' + (isError ? ' list-state--error' : ''), text);
    td.colSpan = columns;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  function showFormError(errorEl, res) {
    var general = res.fields && typeof res.fields.fields === 'string' ? res.fields.fields : '';
    var details = Object.keys(res.fields || {}).filter(function (k) { return k.indexOf('fields.') !== 0 && k !== 'fields'; })
      .map(function (k) { return res.fields[k]; });
    var text = [general].concat(details).filter(Boolean).join(' ');
    errorEl.textContent = text || res.error;
    errorEl.hidden = false;
  }

  // ==========================================================================
  // Catalogue
  // ==========================================================================
  var categoryList = document.getElementById('categoryList');
  var typeBody = document.querySelector('#typeTable tbody');
  var catalogError = document.getElementById('catalogError');

  function load() {
    return EquipifyApi.get('/admin/catalogue').then(function (res) {
      if (!res.ok) {
        catalogError.textContent = res.error;
        catalogError.hidden = false;
        categoryList.textContent = '';
        return;
      }
      catalogError.hidden = true;
      state.categories = res.data.categories;
      state.fieldKeys = res.data.field_keys;
      state.maxFilterable = res.data.max_filterable;
      if (state.selectedId === null && state.categories.length) {
        state.selectedId = state.categories[0].category_id;
      }
      renderStats();
      renderCategories();
      renderSelected();
      fillKnownKeys();
    });
  }

  function renderStats() {
    var types = 0;
    var listings = 0;
    state.categories.forEach(function (c) {
      listings += c.listing_count;
      c.types.forEach(function (t) { if (!t.is_other) types++; });
    });
    document.getElementById('statCategories').textContent = String(state.categories.length);
    document.getElementById('statTypes').textContent = String(types);
    document.getElementById('statListings').textContent = String(listings);
  }

  function selected() {
    for (var i = 0; i < state.categories.length; i++) {
      if (state.categories[i].category_id === state.selectedId) return state.categories[i];
    }
    return null;
  }

  function renderCategories() {
    categoryList.textContent = '';
    state.categories.forEach(function (c) {
      var li = el('li');
      var item = el('button', 'category-item' + (c.category_id === state.selectedId ? ' is-selected' : '') + (c.is_active ? '' : ' is-inactive'));
      item.type = 'button';
      item.setAttribute('aria-pressed', c.category_id === state.selectedId ? 'true' : 'false');
      item.appendChild(icon(c.icon));
      item.appendChild(el('span', 'category-item-name', c.name));
      var realTypes = c.types.filter(function (t) { return !t.is_other; }).length;
      item.appendChild(el('span', 'category-item-count', realTypes + ' types'));
      item.addEventListener('click', function () {
        state.selectedId = c.category_id;
        renderCategories();
        renderSelected();
      });
      li.appendChild(item);
      categoryList.appendChild(li);
    });
  }

  function renderSelected() {
    var c = selected();
    var actions = document.getElementById('categoryActions');
    if (!c) {
      actions.hidden = true;
      messageRow(typeBody, 'Pick a category to see its types.', 5);
      return;
    }
    document.getElementById('categoryIcon').textContent = c.icon;
    document.getElementById('categoryName').textContent = c.name;
    var realTypes = c.types.filter(function (t) { return !t.is_other; }).length;
    document.getElementById('categoryMeta').textContent =
      realTypes + ' types · ' + c.listing_count + ' live listings' + (c.is_active ? '' : ' · hidden from customers');
    document.getElementById('toggleCategoryBtn').textContent = c.is_active ? 'Deactivate' : 'Activate';
    actions.hidden = false;

    typeBody.textContent = '';
    c.types.forEach(function (t) {
      var tr = el('tr');
      var nameCell = el('td');
      nameCell.appendChild(el('strong', null, t.name));
      if (t.is_other) nameCell.appendChild(el('span', 'type-other-note', 'Catch-all: listings describe their own specs'));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', t.is_other ? 'cell-muted' : null, t.is_other ? '—' : String(t.field_count)));
      tr.appendChild(el('td', null, String(t.listing_count)));
      var status = el('td');
      status.appendChild(badge(t.is_active, 'Active', 'Inactive'));
      tr.appendChild(status);

      var actionsCell = el('td');
      var wrap = el('div', 'row-actions');
      if (!t.is_other) {
        wrap.appendChild(button('Edit', 'btn-outline btn-small', function () { openTypeForEdit(t.type_id); }));
        wrap.appendChild(button(t.is_active ? 'Deactivate' : 'Activate', 'btn-outline btn-small', function () {
          toggleType(t);
        }));
      }
      actionsCell.appendChild(wrap);
      tr.appendChild(actionsCell);
      typeBody.appendChild(tr);
    });
  }

  function toggleType(t) {
    if (t.is_active && t.listing_count > 0 &&
        !window.confirm('"' + t.name + '" has ' + t.listing_count + ' live listings. Deactivating hides the type from new listings and from customers\' filters. Continue?')) {
      return;
    }
    var action = t.is_active ? 'deactivate' : 'activate';
    EquipifyApi.post('/admin/catalogue/types/' + t.type_id + '/' + action).then(function (res) {
      if (!res.ok) { showToast(res.error); return; }
      showToast('"' + t.name + '" ' + (t.is_active ? 'deactivated.' : 'activated.'));
      load();
    });
  }

  document.getElementById('toggleCategoryBtn').addEventListener('click', function () {
    var c = selected();
    if (!c) return;
    if (c.is_active && !window.confirm('Deactivating "' + c.name + '" hides it and all its types from customers and from the listing form. Continue?')) {
      return;
    }
    EquipifyApi.post('/admin/catalogue/categories/' + c.category_id + '/' + (c.is_active ? 'deactivate' : 'activate')).then(function (res) {
      if (!res.ok) { showToast(res.error); return; }
      showToast('"' + c.name + '" ' + (c.is_active ? 'deactivated.' : 'activated.'));
      load();
    });
  });

  // ---------- Category modal ----------
  var categoryForm = document.getElementById('categoryForm');
  var categoryFormError = document.getElementById('categoryFormError');

  function openCategoryModal(c) {
    state.editingCategoryId = c ? c.category_id : null;
    categoryForm.reset();
    categoryFormError.hidden = true;
    document.getElementById('categoryModalTitle').textContent = c ? 'Edit Category' : 'Add Category';
    document.getElementById('categorySortField').hidden = !c;
    document.getElementById('categoryOtherNote').hidden = !!c;
    if (c) {
      categoryForm.elements.name.value = c.name;
      categoryForm.elements.icon.value = c.icon;
      categoryForm.elements.sort_order.value = c.sort_order;
    }
    openModal('categoryModal');
  }

  document.getElementById('addCategoryBtn').addEventListener('click', function () { openCategoryModal(null); });
  document.getElementById('editCategoryBtn').addEventListener('click', function () { openCategoryModal(selected()); });

  categoryForm.addEventListener('submit', function (event) {
    event.preventDefault();
    categoryFormError.hidden = true;
    if (!categoryForm.checkValidity()) { categoryForm.reportValidity(); return; }

    var body = { name: categoryForm.elements.name.value, icon: categoryForm.elements.icon.value };
    var request;
    if (state.editingCategoryId) {
      body.sort_order = categoryForm.elements.sort_order.value;
      request = EquipifyApi.put('/admin/catalogue/categories/' + state.editingCategoryId, body);
    } else {
      request = EquipifyApi.post('/admin/catalogue/categories', body);
    }
    var submit = categoryForm.querySelector('[type="submit"]');
    submit.disabled = true;
    request.then(function (res) {
      submit.disabled = false;
      if (!res.ok) { showFormError(categoryFormError, res); return; }
      state.selectedId = res.data.category_id;
      closeModal(document.getElementById('categoryModal'));
      showToast(state.editingCategoryId ? 'Category saved.' : 'Category added with its "Other" type.');
      load();
    });
  });

  // ---------- Type modal + spec field editor ----------
  var typeForm = document.getElementById('typeForm');
  var typeFormError = document.getElementById('typeFormError');
  var specRows = document.getElementById('specRows');
  var filterMeter = document.getElementById('filterMeter');
  var typeCategorySelect = document.getElementById('typeCategoryInput');

  function fillKnownKeys() {
    var list = document.getElementById('knownKeys');
    list.textContent = '';
    state.fieldKeys.forEach(function (k) {
      var opt = el('option');
      opt.value = k.field_key;
      opt.label = k.label + (k.unit ? ' (' + k.unit + ')' : '') + ' — used by ' + k.used_by;
      list.appendChild(opt);
    });
  }

  function fillTypeCategories() {
    typeCategorySelect.textContent = '';
    typeCategorySelect.appendChild(new Option('Select a category', ''));
    state.categories.forEach(function (c) {
      typeCategorySelect.appendChild(new Option(c.name + (c.is_active ? '' : ' (inactive)'), String(c.category_id)));
    });
  }

  function labelled(labelText, control) {
    var wrap = el('div', 'field');
    var label = el('label', 'field-label', labelText);
    label.htmlFor = control.id;
    wrap.appendChild(label);
    wrap.appendChild(control);
    return wrap;
  }

  var rowSeq = 0;
  function addSpecRow(field) {
    field = field || {};
    var n = ++rowSeq;
    var row = el('div', 'spec-row');

    var key = el('input', 'input-standard');
    key.id = 'specKey' + n;
    key.setAttribute('list', 'knownKeys');
    key.maxLength = 50;
    key.placeholder = 'e.g. power_output_kva';
    key.value = field.field_key || '';
    key.dataset.prop = 'field_key';

    var label = el('input', 'input-standard');
    label.id = 'specLabel' + n;
    label.maxLength = 80;
    label.placeholder = 'e.g. Power output';
    label.value = field.label || '';
    label.dataset.prop = 'label';

    var type = el('select', 'input-standard');
    type.id = 'specType' + n;
    type.dataset.prop = 'data_type';
    DATA_TYPES.forEach(function (d) { type.appendChild(new Option(d[1], d[0])); });
    type.value = field.data_type || 'number';

    var unit = el('input', 'input-standard');
    unit.id = 'specUnit' + n;
    unit.maxLength = 20;
    unit.placeholder = 'e.g. kVA';
    unit.value = field.unit || '';
    unit.dataset.prop = 'unit';

    var remove = el('button', 'spec-remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove this spec field');
    remove.appendChild(icon('delete'));
    remove.addEventListener('click', function () {
      row.remove();
      updateMeter();
      if (!specRows.children.length) showEmptySpecs();
    });

    var optionsInput = el('input', 'input-standard');
    optionsInput.id = 'specOptions' + n;
    optionsInput.placeholder = 'Comma-separated, e.g. Diesel, Petrol, Electric';
    optionsInput.value = (field.options || []).join(', ');
    optionsInput.dataset.prop = 'options';
    var optionsWrap = labelled('Options', optionsInput);
    optionsWrap.classList.add('spec-options');

    var flags = el('div', 'spec-flags');
    var required = el('input');
    required.type = 'checkbox';
    required.checked = !!field.is_required;
    var requiredLabel = el('label');
    requiredLabel.appendChild(required);
    requiredLabel.appendChild(document.createTextNode('Required when listing'));
    var filterable = el('input');
    filterable.type = 'checkbox';
    filterable.checked = !!field.is_filterable;
    filterable.dataset.prop = 'is_filterable';
    filterable.addEventListener('change', updateMeter);
    var filterLabel = el('label');
    filterLabel.appendChild(filterable);
    filterLabel.appendChild(document.createTextNode('Customer filter'));
    flags.appendChild(requiredLabel);
    flags.appendChild(filterLabel);

    var rowError = el('p', 'spec-row-error');
    rowError.hidden = true;
    rowError.setAttribute('role', 'alert');

    function syncType() {
      var choice = type.value === 'select' || type.value === 'multiselect';
      optionsWrap.hidden = !choice;
      unit.disabled = type.value !== 'number';
      if (unit.disabled) unit.value = '';
      filterable.disabled = type.value === 'text';
      if (filterable.disabled) filterable.checked = false;
      updateMeter();
    }
    type.addEventListener('change', syncType);

    // Picking a key the catalogue already uses copies its label/type/unit,
    // so the same idea is described the same way in every type.
    key.addEventListener('change', function () {
      var known = state.fieldKeys.filter(function (k) { return k.field_key === key.value.trim(); })[0];
      if (!known || label.value) return;
      label.value = known.label;
      type.value = known.data_type;
      unit.value = known.unit || '';
      syncType();
    });

    row.appendChild(labelled('Key', key));
    row.appendChild(labelled('Label', label));
    row.appendChild(labelled('Data type', type));
    row.appendChild(labelled('Unit', unit));
    row.appendChild(remove);
    row.appendChild(optionsWrap);
    row.appendChild(flags);
    row.appendChild(rowError);

    row.readField = function () {
      var choice = type.value === 'select' || type.value === 'multiselect';
      return {
        field_key: key.value.trim(),
        label: label.value.trim(),
        data_type: type.value,
        unit: unit.value.trim(),
        options: choice ? optionsInput.value.split(',').map(function (o) { return o.trim(); }).filter(Boolean) : null,
        is_required: required.checked,
        is_filterable: filterable.checked
      };
    };
    row.showError = function (messages) {
      row.querySelectorAll('[data-prop]').forEach(function (input) {
        if (messages[input.dataset.prop]) {
          input.setAttribute('aria-invalid', 'true');
        } else {
          input.removeAttribute('aria-invalid');
        }
      });
      var text = Object.keys(messages).map(function (k) { return messages[k]; }).join(' ');
      rowError.textContent = text;
      rowError.hidden = !text;
    };

    var empty = specRows.querySelector('.spec-empty');
    if (empty) empty.remove();
    specRows.appendChild(row);
    syncType();
    return row;
  }

  function showEmptySpecs() {
    specRows.textContent = '';
    specRows.appendChild(el('p', 'spec-empty', 'No spec fields yet. Listings of this type will only have the common fields (rate, condition, location…).'));
  }

  function rows() {
    return Array.prototype.slice.call(specRows.querySelectorAll('.spec-row'));
  }

  function updateMeter() {
    var count = rows().filter(function (r) { return r.readField().is_filterable; }).length;
    filterMeter.textContent = count + ' / ' + state.maxFilterable + ' filters';
    filterMeter.classList.toggle('is-over', count > state.maxFilterable);
  }

  function resetTypeForm(title) {
    typeForm.reset();
    typeFormError.hidden = true;
    document.getElementById('typeModalTitle').textContent = title;
    fillTypeCategories();
    specRows.textContent = '';
  }

  document.getElementById('addTypeBtn').addEventListener('click', function () {
    state.editingTypeId = null;
    state.approvingRequest = null;
    resetTypeForm('Add Equipment Type');
    typeCategorySelect.disabled = false;
    if (state.selectedId) typeCategorySelect.value = String(state.selectedId);
    addSpecRow();
    updateMeter();
    openModal('typeModal');
  });

  document.getElementById('addFieldBtn').addEventListener('click', function () {
    addSpecRow().querySelector('input').focus();
  });

  function openTypeForEdit(typeId) {
    EquipifyApi.get('/admin/catalogue/types/' + typeId).then(function (res) {
      if (!res.ok) { showToast(res.error); return; }
      state.editingTypeId = typeId;
      state.approvingRequest = null;
      resetTypeForm('Edit ' + res.data.name);
      typeCategorySelect.value = String(res.data.category_id);
      typeCategorySelect.disabled = true;
      typeForm.elements.name.value = res.data.name;
      if (res.data.fields.length) {
        res.data.fields.forEach(addSpecRow);
      } else {
        showEmptySpecs();
      }
      updateMeter();
      openModal('typeModal');
    });
  }

  typeForm.addEventListener('submit', function (event) {
    event.preventDefault();
    typeFormError.hidden = true;
    rows().forEach(function (r) { r.showError({}); });
    if (!typeForm.checkValidity()) { typeForm.reportValidity(); return; }

    var body = {
      category_id: typeCategorySelect.value,
      name: typeForm.elements.name.value,
      fields: rows().map(function (r) { return r.readField(); })
    };

    var request;
    if (state.approvingRequest) {
      request = EquipifyApi.post('/admin/type-requests/' + state.approvingRequest.request_id + '/approve', body);
    } else if (state.editingTypeId) {
      request = EquipifyApi.put('/admin/catalogue/types/' + state.editingTypeId, body);
    } else {
      request = EquipifyApi.post('/admin/catalogue/types', body);
    }

    var submit = typeForm.querySelector('[type="submit"]');
    submit.disabled = true;
    request.then(function (res) {
      submit.disabled = false;
      if (!res.ok) {
        showFormError(typeFormError, res);
        // Per-row messages arrive as "fields.<index>.<property>".
        var byRow = {};
        Object.keys(res.fields || {}).forEach(function (k) {
          var m = /^fields\.(\d+)\.(\w+)$/.exec(k);
          if (!m) return;
          (byRow[m[1]] = byRow[m[1]] || {})[m[2]] = res.fields[k];
        });
        rows().forEach(function (r, i) { if (byRow[i]) r.showError(byRow[i]); });
        return;
      }
      var approving = state.approvingRequest;
      closeModal(document.getElementById('typeModal'));
      state.selectedId = approving ? approving.category_id : Number(body.category_id);
      showToast(approving ? 'Request approved — "' + body.name + '" added.' : 'Equipment type saved.');
      load();
      if (approving) loadRequests();
    });
  });

  // ==========================================================================
  // New-type requests tab
  // ==========================================================================
  var tabs = {
    catalog: [document.getElementById('catalogTab'), document.getElementById('catalogPanel')],
    requests: [document.getElementById('requestsTab'), document.getElementById('requestsPanel')]
  };
  function showTab(name) {
    Object.keys(tabs).forEach(function (key) {
      var on = key === name;
      tabs[key][0].classList.toggle('is-active', on);
      tabs[key][0].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[key][1].hidden = !on;
    });
  }
  tabs.catalog[0].addEventListener('click', function () { showTab('catalog'); });
  tabs.requests[0].addEventListener('click', function () { showTab('requests'); });

  var requestBody = document.querySelector('#requestTable tbody');
  var requestList = EquipifyList.create({
    endpoint: '/admin/type-requests',
    container: requestBody,
    filters: { status: document.getElementById('requestStatusFilter') },
    pager: document.getElementById('requestPager'),
    columns: 6,
    emptyMessage: 'No requests here.',
    onLoad: function (data) {
      var chip = document.getElementById('requestCount');
      if (typeof data.pending_count === 'number') {
        chip.textContent = String(data.pending_count);
        chip.hidden = data.pending_count === 0;
      }
    },
    renderItem: function (r) {
      var tr = el('tr');
      var name = el('td');
      name.appendChild(el('strong', null, r.proposed_name));
      tr.appendChild(name);
      tr.appendChild(el('td', null, r.category_name));
      tr.appendChild(el('td', null, r.business_name));
      tr.appendChild(el('td', r.reason ? null : 'cell-muted', r.reason || '—'));
      var status = el('td');
      var map = { pending: 'pending', approved: 'active', rejected: 'rejected' };
      status.appendChild(el('span', 'badge-status badge-status--' + map[r.status], r.status_label));
      if (r.admin_note) status.appendChild(el('span', 'type-other-note', r.admin_note));
      if (r.resolved_type_name) status.appendChild(el('span', 'type-other-note', 'Created: ' + r.resolved_type_name));
      tr.appendChild(status);
      var actions = el('td');
      var wrap = el('div', 'row-actions');
      if (r.status === 'pending') {
        wrap.appendChild(button('Approve', 'btn-outline btn-small', function () { openApprove(r); }));
        wrap.appendChild(button('Reject', 'btn-outline btn-small', function () { openReject(r); }));
      }
      actions.appendChild(wrap);
      tr.appendChild(actions);
      return tr;
    }
  });

  function loadRequests() {
    if (requestList) requestList.reload();
  }

  /** Approving = creating the type, so it opens the type modal pre-filled. */
  function openApprove(r) {
    state.editingTypeId = null;
    state.approvingRequest = r;
    resetTypeForm('Approve "' + r.proposed_name + '"');
    typeCategorySelect.value = String(r.category_id);
    typeCategorySelect.disabled = true;
    typeForm.elements.name.value = r.proposed_name;
    addSpecRow();
    updateMeter();
    openModal('typeModal');
  }

  var rejectForm = document.getElementById('rejectForm');
  var rejectFormError = document.getElementById('rejectFormError');
  function openReject(r) {
    state.rejectingRequestId = r.request_id;
    rejectForm.reset();
    rejectFormError.hidden = true;
    document.getElementById('rejectModalTitle').textContent = 'Reject "' + r.proposed_name + '"';
    openModal('rejectModal');
  }
  rejectForm.addEventListener('submit', function (event) {
    event.preventDefault();
    rejectFormError.hidden = true;
    if (!rejectForm.checkValidity()) { rejectForm.reportValidity(); return; }
    EquipifyApi.post('/admin/type-requests/' + state.rejectingRequestId + '/reject', {
      admin_note: rejectForm.elements.admin_note.value
    }).then(function (res) {
      if (!res.ok) { showFormError(rejectFormError, res); return; }
      closeModal(document.getElementById('rejectModal'));
      showToast('Request rejected.');
      loadRequests();
    });
  });

  load();
})();
