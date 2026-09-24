(function () {
  'use strict';

  var roleRoutes = {
    customer: {
      dashboard: '../../Customer/Browsing page/index.html',
      profile: '../../Customer/Profile/index.html'
    },
    renting_party: {
      dashboard: '../../Renting Party/Dashboard/index.html',
      profile: '../../Renting Party/Profile/index.html'
    },
    delivery_personnel: {
      dashboard: '../../Delivery Personnel/Dashboard/index.html',
      profile: '../../Delivery Personnel/Profile/index.html'
    },
    maintenance_tech: {
      dashboard: '../../Technician/Dashboard/index.html',
      profile: '../../Technician/Profile/index.html'
    },
    area_manager: {
      dashboard: '../../Area Manager/Dashboard/index.html',
      profile: '../../Area Manager/Profile/index.html'
    },
    admin: {
      dashboard: '../../Admin/Dashboard/index.html',
      profile: '../../Admin/Profile/index.html'
    }
  };

  function initialiseRoleNavigation() {
    var routeLinks = document.querySelectorAll('[data-role-route]');
    if (!routeLinks.length || !window.EquipifyApi) return;

    routeLinks.forEach(function (link) {
      link.addEventListener('click', function (event) {
        if (link.getAttribute('href') === '#') event.preventDefault();
      });
    });

    EquipifyApi.get('/auth/me').then(function (res) {
      var routes = res.ok ? roleRoutes[res.data.role] : null;
      routeLinks.forEach(function (link) {
        var destination = routes && routes[link.dataset.roleRoute];
        if (destination) {
          link.href = destination;
          return;
        }
      });
    });
  }

  initialiseRoleNavigation();

  var form = document.getElementById('complaintForm');
  var successMessage = document.getElementById('successMessage');
  var complainant = document.getElementById('complainant');
  var complaintAgainst = document.getElementById('complaintAgainst');

  if (!form) return;

  function clearErrors() {
    form.querySelectorAll('.form-field').forEach(function (field) {
      field.classList.remove('has-error');
    });
    form.querySelectorAll('.field-error').forEach(function (message) {
      message.textContent = '';
    });
  }

  function showError(fieldId, message) {
    var field = document.getElementById(fieldId);
    var container = field && field.closest('.form-field');
    var error = form.querySelector('[data-error-for="' + fieldId + '"]');
    if (container) container.classList.add('has-error');
    if (error) error.textContent = message;
  }

  function validate() {
    clearErrors();
    var firstInvalid = null;
    var requiredFields = ['complainant', 'complaintAgainst', 'category', 'subject', 'description'];

    requiredFields.forEach(function (fieldId) {
      var field = document.getElementById(fieldId);
      if (!field.value.trim()) {
        showError(fieldId, 'This field is required.');
        if (!firstInvalid) firstInvalid = field;
      }
    });

    if (complainant.value && complaintAgainst.value && complainant.value === complaintAgainst.value) {
      showError('complaintAgainst', 'Choose a different actor from the complainant.');
      if (!firstInvalid) firstInvalid = complaintAgainst;
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return false;
    }
    return true;
  }

  function updateTargetOptions() {
    Array.from(complaintAgainst.options).forEach(function (option) {
      var isSameActor = option.value && option.value === complainant.value;
      option.disabled = isSameActor;
      if (isSameActor && complaintAgainst.value === option.value) {
        complaintAgainst.value = '';
      }
    });
  }

  complainant.addEventListener('change', updateTargetOptions);
  complaintAgainst.addEventListener('change', function () {
    var targetError = form.querySelector('[data-error-for="complaintAgainst"]');
    if (complainant.value !== complaintAgainst.value && targetError) {
      targetError.textContent = '';
      complaintAgainst.closest('.form-field').classList.remove('has-error');
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    successMessage.hidden = true;
    if (!validate()) return;

    form.reset();
    updateTargetOptions();
    clearErrors();
    successMessage.hidden = false;
    successMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
})();
