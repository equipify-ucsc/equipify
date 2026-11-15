/* Presentation only: identity is populated by the existing session guard. */
(function () {
  'use strict';
  window.EquipifyManagerArea = EquipifyApi.get('/area-manager/area');
  window.EquipifyManagerArea.then(function (res) {
    var label = res.ok ? res.data.area_name : (res.status === 409 ? 'No active assigned area' : 'Area unavailable');
    document.querySelectorAll('[data-manager-area]').forEach(function (el) {
      el.textContent = label;
      el.title = res.ok ? label : (res.error || label);
    });
    document.querySelectorAll('[data-resource-area]').forEach(function (el) {
      el.textContent = res.ok ? 'Across ' + label : label;
      el.title = res.ok ? label : (res.error || label);
    });
  });
})();
