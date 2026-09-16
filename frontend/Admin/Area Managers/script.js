/* ==========================================================================
   Equipify — Area Managers
   Mobile navigation drawer + table search filter + register-manager modal
   (vanilla JS, no dependencies)
   ========================================================================== */

(function () {
  'use strict';

  // ---------- Toast helper ----------
  var toastTimer;
  window.showToast = function (message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2600);
  };

  // ---------- Table search filter ----------
  document.querySelectorAll('[data-filter-table]').forEach(function (input) {
    input.addEventListener('input', function () {
      var target = document.getElementById(input.dataset.filterTable);
      if (!target) return;
      var query = input.value.toLowerCase();
      target.querySelectorAll('tbody tr').forEach(function (row) {
        row.hidden = !row.textContent.toLowerCase().includes(query);
      });
    });
  });

  // ---------- Modal open/close ----------
  document.querySelectorAll('[data-modal-open]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var modal = document.getElementById(btn.dataset.modalOpen);
      if (modal) modal.classList.add('is-open');
    });
  });
  document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var modal = btn.closest('.modal-backdrop');
      if (modal) modal.classList.remove('is-open');
    });
  });
  document.querySelectorAll('.modal-backdrop').forEach(function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) modal.classList.remove('is-open');
    });
  });

  // ---------- Generic "View" / "Approve" style buttons ----------
  document.querySelectorAll('[data-toast]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.showToast(btn.dataset.toast);
    });
  });

  // ---------- Register area manager form ----------
  var managerForm = document.getElementById('managerForm');
  if (managerForm) {
    managerForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!managerForm.checkValidity()) {
        managerForm.reportValidity();
        return;
      }
      window.showToast(managerForm.dataset.successMessage || 'Changes saved successfully.');
      var modal = managerForm.closest('.modal-backdrop');
      if (modal) modal.classList.remove('is-open');
      managerForm.reset();
    });
  }
})();
