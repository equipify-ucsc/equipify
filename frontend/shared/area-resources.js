/* Shared presentation for the three area-scoped operational resource pages. */
(function () {
  'use strict';
  var filter = document.createElement('select');
  filter.className = 'select-filter'; filter.id = 'resourceAreaFilter'; filter.setAttribute('aria-label', 'Filter by area');
  filter.appendChild(new Option('All permitted areas', ''));
  var toolbar = document.querySelector('.toolbar'); if (toolbar) toolbar.appendChild(filter);
  var notice = document.createElement('p'); notice.setAttribute('role', 'status'); notice.textContent = 'Loading assigned area...';
  document.querySelector('.page-head').insertAdjacentElement('afterend', notice);
  var create = document.querySelector('#addVehicleBtn, [data-modal-open="personnelModal"], [data-modal-open="technicianModal"]');
  if (create) create.disabled = true;
  (window.EquipifyManagerArea || EquipifyApi.get('/area-manager/area')).then(function (res) {
    if (!res.ok) { notice.textContent = res.error; return; }
    notice.textContent = 'Operational area: ' + res.data.area_name + '. Resources are shared with other managers in this area.';
    if (create) create.disabled = false;
  });
  filter.addEventListener('change', function () {
    var status = document.getElementById('statusFilter'); if (status) status.dispatchEvent(new Event('change'));
  });
  var dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', 'Staff details');
  var content = document.createElement('div'), close = document.createElement('button');
  close.className = 'btn-outline'; close.textContent = 'Close'; close.type = 'button';
  close.addEventListener('click', function () { dialog.close(); });
  dialog.appendChild(content); dialog.appendChild(close); document.body.appendChild(dialog);
  var detailRequest = 0;
  dialog.addEventListener('close', function () { detailRequest++; });
  window.AreaResources = {
    rows: function (resources) {
      var selected = filter.value; filter.textContent = ''; filter.appendChild(new Option('All permitted areas', ''));
      var seen = {};
      resources.forEach(function (resource) {
        if (!seen[resource.area_id]) { filter.appendChild(new Option(resource.area_name, String(resource.area_id))); seen[resource.area_id] = true; }
      });
      filter.value = seen[selected] ? selected : '';
      var counts = document.querySelectorAll('[data-resource-count]');
      counts.forEach(function (el) {
        var state = el.dataset.resourceCount;
        el.textContent = state === 'total' ? resources.length : resources.filter(function (r) { return r.availability_status === state; }).length;
      });
    },
    matches: function (row) { return !filter.value || row.dataset.area === filter.value; },
    view: function (path) {
      var request = ++detailRequest; content.textContent = 'Loading staff details...'; dialog.showModal();
      EquipifyApi.get(path).then(function (res) {
        if (request !== detailRequest) return;
        if (!res.ok) { content.textContent = res.error; return; }
        content.textContent = '';
        var fields = { full_name: 'Name', area_name: 'Area', phone: 'Phone', email: 'Email', district: 'District',
          driving_license_no: 'Driving licence', license_class: 'Licence class', license_expiry: 'Licence expiry',
          specialization: 'Categories serviced', years_experience: 'Years of experience', availability_status: 'Availability', account_status: 'Account status' };
        var list = document.createElement('dl');
        Object.keys(fields).forEach(function (key) {
          if (res.data[key] === undefined || res.data[key] === null) return;
          var label = document.createElement('dt'), value = document.createElement('dd');
          label.textContent = fields[key]; value.textContent = res.data[key]; list.appendChild(label); list.appendChild(value);
        });
        content.appendChild(list);
      });
    }
  };
})();
