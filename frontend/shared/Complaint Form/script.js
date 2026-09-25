(function () {
  'use strict';
  var routes = { customer: 'Customer/Complaints', renting_party: 'Renting Party/Complaints', freelance_worker: 'Freelance Worker/Complaints', maintenance_tech: 'Technician/Complaints', delivery_personnel: 'Delivery Personnel/Complaints', area_manager: 'Area Manager/Complaints', admin: 'Admin/Complaints & Users' };
  EquipifyApi.get('/auth/me').then(function (res) {
    if (res.ok && routes[res.data.role]) window.location.replace('../../' + routes[res.data.role] + '/index.html');
    else document.getElementById('complaintEntryMessage').textContent = res.error || 'Log in using your role login page to manage complaints.';
  });
})();
