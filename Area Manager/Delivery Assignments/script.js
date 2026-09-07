/* ==========================================================================
   Equipify — Delivery Assignments (Area Manager)
   Mobile navigation drawer, status filter, and personnel+vehicle
   assignment forms (vanilla JS, no dependencies)
   ========================================================================== */

(function () {
  'use strict';

  var sidenav = document.getElementById('sidenav');
  var overlay = document.getElementById('sidenavOverlay');
  var openBtn = document.getElementById('menuOpenBtn');
  var closeBtn = document.getElementById('menuCloseBtn');

  if (sidenav && overlay && openBtn && closeBtn) {
    var focusableSelector = 'a[href], button:not([disabled])';
    var lastFocusedElement = null;

    var openNav = function () {
      lastFocusedElement = document.activeElement;
      sidenav.classList.add('is-open');
      overlay.classList.add('is-open');
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';

      var firstFocusable = sidenav.querySelector(focusableSelector);
      if (firstFocusable) {
        firstFocusable.focus();
      }

      document.addEventListener('keydown', onKeydown);
    };

    var closeNav = function () {
      sidenav.classList.remove('is-open');
      overlay.classList.remove('is-open');
      openBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';

      document.removeEventListener('keydown', onKeydown);

      if (lastFocusedElement) {
        lastFocusedElement.focus();
      } else {
        openBtn.focus();
      }
    };

    function onKeydown(event) {
      if (event.key === 'Escape') {
        closeNav();
        return;
      }

      if (event.key === 'Tab') {
        var focusableEls = sidenav.querySelectorAll(focusableSelector);
        if (focusableEls.length === 0) return;

        var firstEl = focusableEls[0];
        var lastEl = focusableEls[focusableEls.length - 1];

        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    }

    openBtn.addEventListener('click', openNav);
    closeBtn.addEventListener('click', closeNav);
    overlay.addEventListener('click', closeNav);

    sidenav.querySelectorAll('.sidenav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.matchMedia('(max-width: 767px)').matches) {
          closeNav();
        }
      });
    });

    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width: 768px)').matches && sidenav.classList.contains('is-open')) {
        closeNav();
      }
    });
  }

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

  // ---------- Refresh button ----------
  var refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      window.showToast('Delivery assignments refreshed.');
    });
  }

  // ---------- Stub links (sections not built yet) ----------
  document.querySelectorAll('.is-stub').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var label = link.getAttribute('data-stub-label') || 'This section';
      window.showToast(label + ' is coming soon.');
    });
  });

  // ---------- Status filter tabs ----------
  var filterTabs = document.querySelectorAll('.filter-tab');
  var assignmentCards = document.querySelectorAll('.assignment-card');
  filterTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      filterTabs.forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      var status = tab.getAttribute('data-filter');
      assignmentCards.forEach(function (card) {
        card.hidden = status !== 'all' && card.getAttribute('data-status') !== status;
      });
    });
  });

  // ---------- Searchable dropdowns (combobox) ----------
  function initCombobox(combobox) {
    var input = combobox.querySelector('.combobox-input');
    var list = combobox.querySelector('.combobox-list');
    var emptyState = list.querySelector('.combobox-empty');
    var options = Array.prototype.slice.call(list.querySelectorAll('.combobox-option'));
    var activeIndex = -1;

    function setActiveOption(index) {
      options.forEach(function (opt) { opt.classList.remove('is-active'); });
      var visible = options.filter(function (opt) { return !opt.hidden; });
      if (index >= 0 && index < visible.length) {
        visible[index].classList.add('is-active');
        visible[index].scrollIntoView({ block: 'nearest' });
      }
    }

    function openList() {
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function closeList() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      activeIndex = -1;
      setActiveOption(-1);
    }

    function filterOptions() {
      var query = input.value.trim().toLowerCase();
      var anyVisible = false;
      options.forEach(function (opt) {
        var match = opt.textContent.toLowerCase().indexOf(query) !== -1;
        opt.hidden = !match;
        if (match) anyVisible = true;
      });
      if (emptyState) emptyState.hidden = anyVisible;
      activeIndex = -1;
      setActiveOption(-1);
    }

    function selectOption(option) {
      input.value = option.textContent;
      input.dataset.value = option.getAttribute('data-value');
      closeList();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      combobox.dispatchEvent(new CustomEvent('combobox:select', { bubbles: true }));
    }

    input.addEventListener('focus', function () {
      filterOptions();
      openList();
    });

    input.addEventListener('input', function () {
      if (input.value !== (input.dataset.selectedLabel || '')) {
        input.dataset.value = '';
      }
      filterOptions();
      openList();
    });

    input.addEventListener('keydown', function (event) {
      var visible = options.filter(function (opt) { return !opt.hidden; });
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openList();
        activeIndex = Math.min(activeIndex + 1, visible.length - 1);
        setActiveOption(activeIndex);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        setActiveOption(activeIndex);
      } else if (event.key === 'Enter') {
        if (!list.hidden && activeIndex >= 0 && visible[activeIndex]) {
          event.preventDefault();
          input.dataset.selectedLabel = visible[activeIndex].textContent;
          selectOption(visible[activeIndex]);
        }
      } else if (event.key === 'Escape') {
        closeList();
      }
    });

    options.forEach(function (opt) {
      opt.addEventListener('mousedown', function (event) {
        event.preventDefault();
        input.dataset.selectedLabel = opt.textContent;
        selectOption(opt);
      });
    });

    document.addEventListener('click', function (event) {
      if (!combobox.contains(event.target)) closeList();
    });
  }

  document.querySelectorAll('.combobox').forEach(initCombobox);

  // ---------- Personnel + vehicle assignment forms ----------
  document.querySelectorAll('.assignment-form').forEach(function (form) {
    var personnelInput = form.querySelector('.js-personnel-combobox .combobox-input');
    var vehicleInput = form.querySelector('.js-vehicle-combobox .combobox-input');
    var submitBtn = form.querySelector('button[type="submit"]');

    function updateSubmitState() {
      submitBtn.disabled = !(personnelInput.dataset.value && vehicleInput.dataset.value);
    }
    form.addEventListener('input', updateSubmitState);
    form.addEventListener('combobox:select', updateSubmitState);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var card = form.closest('.assignment-card');
      var summary = card.querySelector('.assignment-summary');
      var badge = card.querySelector('.badge-status');
      var personnelName = personnelInput.dataset.value;
      var vehicleName = vehicleInput.dataset.value;

      summary.querySelector('.assigned-personnel').textContent = personnelName;
      summary.querySelector('.assigned-vehicle').textContent = vehicleName;

      form.hidden = true;
      summary.hidden = false;

      card.setAttribute('data-status', 'assigned');
      badge.textContent = 'Assigned';
      badge.classList.remove('badge-status--pending');
      badge.classList.add('badge-status--active');

      window.showToast('Delivery assigned to ' + personnelName + '.');
    });
  });

  // ---------- Reassign buttons ----------
  document.querySelectorAll('.assignment-reassign-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.assignment-card');
      card.querySelector('.assignment-summary').hidden = true;
      card.querySelector('.assignment-form').hidden = false;
    });
  });
})();
