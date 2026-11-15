/* Area CRUD is independent of manager registration and assignments. */
(function () {
  'use strict';
  var table = document.querySelector('#areaTable tbody');
  var form = document.getElementById('areaForm');
  var modal = document.getElementById('areaModal');
  var save = document.getElementById('areaSave');
  var refresh = document.getElementById('areaRefresh');
  var search = document.getElementById('areaSearch');
  var status = document.getElementById('areaStatus');
  var message = document.getElementById('areaMessage');
  var error = document.getElementById('areaFormError');
  var areas = [], editing = null, lastFocus = null, busy = false;

  function node(tag, text) {
    var el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function feedback(text, failed) {
    message.textContent = text;
    message.className = failed ? 'area-error' : 'area-success';
    message.hidden = false;
  }
  function details(res) { return Object.values(res.fields || {}).join(' ') || res.error; }
  function textCell(label, value, limit) {
    var cell = node('td'); cell.dataset.label = label; cell.setAttribute('role', 'cell');
    if (!value) { cell.appendChild(node('span', '—')); return cell; }
    // Only presentation is shortened; the record and editable values stay intact.
    var characters = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), function (part) { return part.segment; })
      : Array.from(value);
    var disclosure = node('details'); disclosure.className = 'area-text';
    var summary = node('summary');
    var preview = node('span', characters.length > limit ? characters.slice(0, limit).join('') + '…' : value);
    preview.className = 'area-text-preview'; preview.title = value;
    var hint = node('span', 'Show full ' + label.toLowerCase()); hint.className = 'area-text-hint';
    summary.appendChild(preview); summary.appendChild(hint);
    var full = node('div', value); full.className = 'area-text-full';
    disclosure.appendChild(summary); disclosure.appendChild(full);
    disclosure.addEventListener('toggle', function () {
      hint.textContent = (disclosure.open ? 'Hide full ' : 'Show full ') + label.toLowerCase();
    });
    cell.appendChild(disclosure); return cell;
  }
  function render() {
    table.textContent = '';
    var term = search.value.trim().toLowerCase();
    var visible = areas.filter(function (area) {
      return (!status.value || area.is_active === (status.value === 'active')) &&
        (area.name + ' ' + (area.description || '')).toLowerCase().includes(term);
    });
    document.getElementById('areaCount').textContent = visible.length + ' of ' + areas.length + ' areas';
    if (!visible.length) {
      var empty = node('tr'), cell = node('td', areas.length ? 'No areas match these filters.' : 'No areas created yet.');
      cell.colSpan = 4; empty.appendChild(cell); table.appendChild(empty);
    }
    visible.forEach(function (area) {
      var row = node('tr');
      row.setAttribute('role', 'row');
      row.appendChild(textCell('Name', area.name, 64));
      var description = textCell('Description', area.description, 120);
      description.className = 'area-description'; row.appendChild(description);
      var state = node('td'), badge = node('span', area.is_active ? 'Active' : 'Inactive');
      state.dataset.label = 'Status'; state.setAttribute('role', 'cell');
      badge.className = 'badge-status badge-status--' + (area.is_active ? 'active' : 'pending');
      state.appendChild(badge); row.appendChild(state);
      var actions = node('td'); actions.className = 'area-actions';
      actions.dataset.label = 'Actions'; actions.setAttribute('role', 'cell');
      var actionButtons = node('div'); actionButtons.className = 'area-action-buttons';
      var edit = node('button', 'Edit'); edit.type = 'button'; edit.className = 'btn-outline btn-sm'; edit.disabled = busy;
      edit.setAttribute('aria-label', 'Edit ' + area.name);
      edit.addEventListener('click', function () { open(area); }); actionButtons.appendChild(edit);
      var toggle = node('button', area.is_active ? 'Deactivate' : 'Activate');
      toggle.type = 'button'; toggle.className = 'btn-outline btn-sm'; toggle.disabled = busy;
      toggle.setAttribute('aria-label', toggle.textContent + ' ' + area.name);
      toggle.addEventListener('click', function () {
        if (busy || !window.confirm((area.is_active ? 'Deactivate' : 'Activate') + ' area “' + area.name + '”?')) return;
        busy = true; refresh.disabled = true; render();
        EquipifyApi.post('/admin/areas/' + area.area_id + (area.is_active ? '/deactivate' : '/activate')).then(function (res) {
          if (!res.ok) feedback(details(res), true);
          else { replace(res.data); feedback('Area ' + (res.data.is_active ? 'activated.' : 'deactivated.'), false); }
          busy = false; refresh.disabled = false; render();
        });
      });
      actionButtons.appendChild(toggle); actions.appendChild(actionButtons); row.appendChild(actions); table.appendChild(row);
    });
  }
  function replace(area) {
    var index = areas.findIndex(function (item) { return item.area_id === area.area_id; });
    if (index < 0) areas.push(area); else areas[index] = area;
    areas.sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function load() {
    if (busy) return;
    busy = true; refresh.disabled = true; render();
    EquipifyApi.get('/admin/areas').then(function (res) {
      busy = false; refresh.disabled = false;
      if (!res.ok) {
        feedback(details(res), true);
        table.textContent = ''; var row = node('tr'), cell = node('td', 'Areas could not be loaded. Use Refresh Areas to retry.');
        cell.colSpan = 4; row.appendChild(cell); table.appendChild(row); return;
      }
      areas = res.data; message.hidden = true; render();
    });
  }
  function open(area) {
    if (busy) return;
    editing = area ? area.area_id : null; lastFocus = document.activeElement;
    form.reset(); error.hidden = true;
    document.getElementById('areaFormTitle').textContent = editing ? 'Edit Area' : 'Create Area';
    save.textContent = editing ? 'Save Changes' : 'Create Area';
    if (area) { form.elements.name.value = area.name; form.elements.description.value = area.description || ''; }
    modal.classList.add('is-open'); form.elements.name.focus();
  }
  function close() {
    if (save.disabled) return;
    modal.classList.remove('is-open'); if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  }
  document.getElementById('areaCreate').addEventListener('click', function () { open(null); });
  modal.querySelectorAll('[data-area-close]').forEach(function (button) { button.addEventListener('click', close); });
  modal.addEventListener('click', function (event) { if (event.target === modal) close(); });
  modal.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    var controls = Array.from(modal.querySelectorAll('button:not(:disabled), input, textarea'));
    var first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault(); if (busy || !form.reportValidity()) return;
    busy = true; save.disabled = true; refresh.disabled = true; error.hidden = true;
    var body = { name: form.elements.name.value.trim(), description: form.elements.description.value.trim() };
    var request = editing ? EquipifyApi.put('/admin/areas/' + editing, body) : EquipifyApi.post('/admin/areas', body);
    request.then(function (res) {
      busy = false; save.disabled = false; refresh.disabled = false;
      if (!res.ok) { error.textContent = details(res); error.hidden = false; return; }
      replace(res.data); close(); render(); feedback('Area saved successfully.', false);
    });
  });
  search.addEventListener('input', render); status.addEventListener('change', render);
  refresh.addEventListener('click', load); load();
})();
