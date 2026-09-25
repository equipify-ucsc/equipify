/* Shared complaint UI. Uses session-authenticated JSON APIs and the existing list helper. */
(function () {
  'use strict';
  var table = document.getElementById('complaintTable');
  if (!table) return;
  var role = document.body.dataset.requireAuth;
  var reviewer = role === 'admin' || role === 'area_manager';
  var endpoint = role === 'freelance_worker' ? '/freelancer/complaints' : '/complaints';
  var roles = { customer: 'Customer', renting_party: 'Renting Party', freelance_worker: 'Freelance Worker',
    maintenance_tech: 'Maintenance Technician', delivery_personnel: 'Delivery Personnel' };
  var statuses = { open: 'Open', under_review: 'Under Review', resolved: 'Resolved' };
  var form = document.getElementById('complaintForm');
  var message = document.getElementById('complaintMessage');
  var lastFocus;

  function element(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function notify(text, error) {
    message.textContent = text;
    message.className = error ? 'form-error' : 'complaint-success';
    message.hidden = false;
  }
  function errorText(res) {
    var fields = Object.values(res.fields || {});
    return fields.length ? fields.join(' ') : res.error;
  }
  function openModal(id) {
    lastFocus = document.activeElement;
    var modal = document.getElementById(id);
    modal.classList.add('is-open');
    modal.querySelector('button, select, input').focus();
  }
  function closeModal(modal) {
    modal.classList.remove('is-open');
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll('[data-complaint-open]').forEach(function (button) {
    button.addEventListener('click', function () {
      openModal(button.dataset.complaintOpen);
      if (form) loadTargets();
    });
  });
  document.querySelectorAll('[data-complaint-close]').forEach(function (button) {
    button.addEventListener('click', function () { closeModal(button.closest('.modal-backdrop')); });
  });
  document.querySelectorAll('[data-complaint-modal]').forEach(function (modal) {
    modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(modal); });
    modal.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeModal(modal);
      if (event.key !== 'Tab') return;
      var controls = Array.from(modal.querySelectorAll('button:not(:disabled), input, select, textarea, a[href]'));
      var first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  });

  function row(item) {
    var tr = element('tr');
    var fields = ['complaint_id'];
    if (reviewer) fields.push('complainant_name', 'complainant_role');
    fields.push('against_name');
    if (reviewer) fields.push('against_role');
    fields.push('category', 'subject', 'created_at', 'status');
    fields.forEach(function (key) {
      var value = item[key];
      if (key.indexOf('_role') !== -1) value = roles[value] || value;
      if (key === 'against_name' && !value) value = 'Deleted user';
      var cell = element('td', key === 'status' ? '' : value);
      if (key === 'status') cell.appendChild(element('span', statuses[value] || value,
        'badge-status ' + (value === 'resolved' ? 'badge-status--active' : 'badge-status--pending')));
      tr.appendChild(cell);
    });
    var action = element('td');
    var button = element('button', 'View Details', 'btn-outline btn-sm');
    button.type = 'button';
    button.addEventListener('click', function () { showDetails(item.complaint_id); });
    action.appendChild(button);
    tr.appendChild(action);
    return tr;
  }
  var list = EquipifyList.create({
    endpoint: endpoint, container: table.tBodies[0], searchInput: document.getElementById('complaintSearch'),
    filters: { status: document.getElementById('statusFilter'), category: document.getElementById('categoryFilter') },
    pager: document.getElementById('complaintPager'), countLabel: document.getElementById('complaintCount'),
    columns: reviewer ? 10 : 7, perPage: reviewer ? 3 : 10,
    emptyMessage: reviewer ? 'No complaints match these filters.' : 'No complaints submitted yet.', renderItem: row
  });
  table.querySelectorAll('[data-complaint-sort]').forEach(function (button) {
    button.addEventListener('click', function () {
      var direction = button.dataset.direction === 'asc' ? 'desc' : 'asc';
      table.querySelectorAll('[data-complaint-sort]').forEach(function (other) {
        other.removeAttribute('data-direction');
        other.closest('th').setAttribute('aria-sort', 'none');
      });
      button.dataset.direction = direction;
      button.closest('th').setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
      list.setParam('sort', button.dataset.complaintSort, true);
      list.setParam('direction', direction);
    });
  });

  var detailsVersion = 0;
  function showDetails(id) {
    var version = ++detailsVersion;
    var content = document.getElementById('complaintDetailsContent');
    content.textContent = 'Loading complaint...';
    openModal('complaintDetailsModal');
    EquipifyApi.get('/complaints/' + id).then(function (res) {
      if (version !== detailsVersion) return;
      content.textContent = '';
      if (!res.ok) { content.appendChild(element('p', res.error, 'form-error')); return; }
      var item = res.data;
      var fields = { complaint_id: 'Complaint ID', complainant_name: 'Complainant', complainant_role: 'Complainant Role',
        against_name: 'Against', against_role: 'Against Role', category: 'Category', subject: 'Subject',
        description: 'Description', created_at: 'Submitted Date', status: 'Status' };
      var dl = element('dl', undefined, 'complaint-details');
      Object.keys(fields).forEach(function (key) {
        var value = item[key];
        if (key.indexOf('_role') !== -1) value = roles[value] || value;
        if (key === 'status') value = statuses[value] || value;
        if (key === 'against_name' && !value) value = 'Deleted user';
        dl.appendChild(element('dt', fields[key]));
        dl.appendChild(element('dd', value));
      });
      content.appendChild(dl);
      if (item.attachment_url) {
        var link = element('a', 'View Evidence', 'btn-outline btn-sm');
        link.href = EquipifyApi.url('/complaints/' + item.complaint_id + '/attachment');
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        content.appendChild(link);
      }
      if (role === 'admin') {
        var actions = element('div', undefined, 'modal-actions');
        ['under_review', 'resolved'].forEach(function (status) {
          var button = element('button', status === 'resolved' ? 'Resolve' : 'Mark Under Review', 'btn-primary btn-sm');
          button.type = 'button';
          button.disabled = item.status === status;
          button.addEventListener('click', function () {
            actions.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
            EquipifyApi.post('/complaints/' + id + '/status', { status: status }).then(function (result) {
              if (!result.ok) {
                content.appendChild(element('p', errorText(result), 'form-error'));
                actions.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
                return;
              }
              closeModal(document.getElementById('complaintDetailsModal'));
              notify('Complaint status updated.');
              list.reload();
            });
          });
          actions.appendChild(button);
        });
        content.appendChild(actions);
      }
    });
  }

  function options(select, values, placeholder) {
    select.textContent = '';
    select.appendChild(new Option(placeholder, ''));
    values.forEach(function (value) { select.appendChild(new Option(value, value)); });
  }
  EquipifyApi.get('/complaints/metadata').then(function (res) {
    if (!res.ok) { notify(res.error, true); return; }
    options(document.getElementById('categoryFilter'), res.data.categories, 'All categories');
    if (form) options(form.elements.category, res.data.categories, 'Select category');
  });
  function loadTargets() {
    var select = form.elements.against_user_id;
    select.disabled = true;
    options(select, [], 'Loading users...');
    EquipifyApi.get('/complaints/targets').then(function (res) {
      options(select, [], res.ok && res.data.length ? 'Select a user' : 'No eligible users available');
      if (!res.ok) { formError(res.error); return; }
      res.data.forEach(function (user) {
        select.appendChild(new Option(user.full_name + ' — ' + (roles[user.role] || user.role), user.user_id));
      });
      select.disabled = false;
    });
  }
  function formError(text) {
    var error = document.getElementById('complaintFormError');
    error.textContent = text;
    error.hidden = false;
  }
  if (!form) return;
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    document.getElementById('complaintFormError').hidden = true;
    if (!form.reportValidity()) return;
    if (form.elements.against_user_id.disabled) { formError('Wait for eligible users to load.'); return; }
    var button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    var payload = { against_user_id: Number(form.elements.against_user_id.value), category: form.elements.category.value,
      subject: form.elements.subject.value.trim(), description: form.elements.description.value.trim() };
    var file = form.elements.attachment.files[0];
    if (file && file.size > 5242880) { formError('Supporting evidence must be at most 5 MB.'); return; }
    button.disabled = true;
    var read = file ? new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve({ name: file.name, data: String(reader.result).split(',')[1] }); };
      reader.onerror = function () { reject(new Error('Could not read supporting evidence.')); };
      reader.readAsDataURL(file);
    }) : Promise.resolve(null);
    read.then(function (attachment) {
      if (attachment) payload.attachment = attachment;
      return EquipifyApi.post(endpoint, payload);
    }).then(function (res) {
      if (!res.ok) { formError(errorText(res)); return; }
      form.reset();
      closeModal(document.getElementById('complaintModal'));
      notify('Complaint submitted successfully.');
      list.setFilter('status', '', true);
      list.setFilter('category', '', true);
      list.reset();
    }).catch(function (error) { formError(error.message); }).finally(function () { button.disabled = false; });
  });
})();
