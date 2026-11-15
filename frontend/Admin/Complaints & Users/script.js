/* ==========================================================================
   Equipify â€” Complaints & Users
   Mobile navigation drawer + table search/filter + modal + user/complaint
   actions (vanilla JS, no dependencies)
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

  // ---------- Table sorting, search, filters and pagination ----------
  var rowsPerPage = 3;
  var tableStates = new Map();

  function getSortValue(row, columnIndex) {
    var cell = row.cells[columnIndex];
    return cell ? cell.textContent.trim() : '';
  }

  function compareRows(firstRow, secondRow, columnIndex, tableId) {
    var firstValue = getSortValue(firstRow, columnIndex);
    var secondValue = getSortValue(secondRow, columnIndex);

    if (tableId === 'complaintsTable' && columnIndex === 0 || tableId === 'usersTable' && columnIndex === 3) {
      return Number(firstValue.replace(/[^0-9.-]/g, '')) - Number(secondValue.replace(/[^0-9.-]/g, ''));
    }

    if (tableId === 'complaintsTable' && columnIndex === 3) {
      var priorityOrder = { low: 1, medium: 2, high: 3 };
      var firstPriority = priorityOrder[firstValue.toLowerCase()] || 0;
      var secondPriority = priorityOrder[secondValue.toLowerCase()] || 0;
      return firstPriority - secondPriority;
    }

    if (tableId === 'complaintsTable' && columnIndex === 5) {
      return Date.parse(firstValue) - Date.parse(secondValue);
    }

    return firstValue.localeCompare(secondValue, undefined, { numeric: true, sensitivity: 'base' });
  }

  function updateSortIndicators(table, state) {
    var pageSort = state.pageSorts.get(state.page) || { column: null, direction: 'asc' };
    table.querySelectorAll('.table-sort').forEach(function (button) {
      var columnIndex = Number(button.dataset.sortColumn);
      var header = button.closest('th');
      var indicator = button.querySelector('.table-sort-indicator');
      var isActive = pageSort.column === columnIndex;

      var label = button.cloneNode(true);
      var labelIndicator = label.querySelector('.table-sort-indicator');
      if (labelIndicator) labelIndicator.remove();
      button.setAttribute('aria-label', 'Sort by ' + label.textContent.trim() + (isActive ? (pageSort.direction === 'asc' ? ', ascending' : ', descending') : ''));
      if (header) header.setAttribute('aria-sort', isActive ? (pageSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      if (indicator) indicator.textContent = isActive ? (pageSort.direction === 'asc' ? '\u2191' : '\u2193') : '\u2195';
    });
  }

  function updatePagination(table, state, totalRows) {
    var pagination = document.querySelector('[data-pagination-for="' + table.id + '"]');
    if (!pagination) return;
    var totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
    state.page = Math.min(state.page, totalPages);
    pagination.innerHTML = '<span class="table-pagination-info">Page ' + state.page + ' of ' + totalPages + '</span>' +
      '<div class="table-pagination-actions"><button class="btn-outline btn-sm" type="button" data-page-action="previous"' + (state.page === 1 ? ' disabled' : '') + '>Previous</button>' +
      '<button class="btn-outline btn-sm" type="button" data-page-action="next"' + (state.page === totalPages ? ' disabled' : '') + '>Next</button></div>';

    pagination.querySelectorAll('[data-page-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.page += button.dataset.pageAction === 'next' ? 1 : -1;
        renderTable(table, state);
      });
    });
  }

  function renderTable(table, state) {
    var rows = state.orderedRows.slice();
    var query = state.search.toLowerCase();
    var status = state.status.toLowerCase();
    var filteredRows = rows.filter(function (row) {
      var matchesSearch = !query || row.textContent.toLowerCase().includes(query);
      var rowStatus = (row.dataset.status || row.textContent).toLowerCase();
      var matchesStatus = !status || rowStatus.includes(status);
      return matchesSearch && matchesStatus;
    });

    var totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
    state.page = Math.min(state.page, totalPages);
    var firstVisibleIndex = (state.page - 1) * rowsPerPage;
    var visibleRows = new Set(filteredRows.slice(firstVisibleIndex, firstVisibleIndex + rowsPerPage));

    rows.forEach(function (row) {
      table.tBodies[0].appendChild(row);
    });
    rows.forEach(function (row) {
      row.hidden = !visibleRows.has(row);
    });

    updateSortIndicators(table, state);
    updatePagination(table, state, filteredRows.length);
  }

  document.querySelectorAll('#usersTable').forEach(function (table) {
    var state = {
      orderedRows: Array.from(table.tBodies[0].rows),
      search: '',
      status: '',
      pageSorts: new Map(),
      page: 1
    };
    tableStates.set(table.id, state);

    table.querySelectorAll('.table-sort').forEach(function (button) {
      button.addEventListener('click', function () {
        var columnIndex = Number(button.dataset.sortColumn);
        var filteredRows = state.orderedRows.filter(function (row) {
          var query = state.search.toLowerCase();
          var status = state.status.toLowerCase();
          var matchesSearch = !query || row.textContent.toLowerCase().includes(query);
          var rowStatus = (row.dataset.status || row.textContent).toLowerCase();
          return matchesSearch && (!status || rowStatus.includes(status));
        });
        var firstVisibleIndex = (state.page - 1) * rowsPerPage;
        var pageRows = filteredRows.slice(firstVisibleIndex, firstVisibleIndex + rowsPerPage);
        var pagePositions = pageRows.map(function (row) {
          return state.orderedRows.indexOf(row);
        });
        var currentSort = state.pageSorts.get(state.page) || { column: null, direction: 'asc' };
        var direction = currentSort.column === columnIndex && currentSort.direction === 'asc' ? 'desc' : 'asc';

        pageRows.sort(function (firstRow, secondRow) {
          var result = compareRows(firstRow, secondRow, columnIndex, table.id);
          return direction === 'asc' ? result : -result;
        });

        pagePositions.forEach(function (position, pageIndex) {
          state.orderedRows[position] = pageRows[pageIndex];
        });
        state.pageSorts.set(state.page, { column: columnIndex, direction: direction });
        renderTable(table, state);
      });
    });

    renderTable(table, state);
  });

  document.querySelectorAll('[data-filter-table]').forEach(function (input) {
    input.addEventListener('input', function () {
      var table = document.getElementById(input.dataset.filterTable);
      var state = table && tableStates.get(table.id);
      if (!state) return;
      state.search = input.value;
      state.page = 1;
      renderTable(table, state);
    });
  });

  document.querySelectorAll('[data-status-filter]').forEach(function (select) {
    select.addEventListener('change', function () {
      var table = document.getElementById(select.dataset.statusFilter);
      var state = table && tableStates.get(table.id);
      if (!state) return;
      state.status = select.value;
      state.page = 1;
      renderTable(table, state);
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

  // ---------- Generic "View" style buttons ----------
  document.querySelectorAll('[data-toast]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.showToast(btn.dataset.toast);
    });
  });
  var usersTable = document.getElementById('usersTable');
  var usersMessage = document.getElementById('usersMessage');
  function userRow(user) {
    var row = document.createElement('tr');
    row.dataset.status = user.account_status;
    [user.full_name, user.role, user.account_status, user.user_id].forEach(function (value) {
      var cell = row.insertCell(); cell.textContent = value;
    });
    var actions = row.insertCell();
    ['suspend', 'ban'].forEach(function (action) {
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'btn-outline btn-sm'; button.textContent = action;
      button.disabled = user.account_status === 'banned' || (action === 'suspend' && user.account_status === 'suspended');
      button.addEventListener('click', async function () {
        var reason = window.prompt('Reason to ' + action + ' ' + user.full_name + ' (maximum 255 characters):');
        if (reason === null) return;
        reason = reason.trim();
        if (!reason || Array.from(reason).length > 255) { usersMessage.textContent = 'Enter a reason of 1 to 255 characters.'; return; }
        if (!window.confirm('Confirm ' + action + ' for user #' + user.user_id + '?')) return;
        actions.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        usersMessage.textContent = 'Saving account status...';
        var result = await EquipifyApi.post('/admin/users/' + user.user_id + '/' + action, {reason: reason});
        if (result.ok) {
          var replacement = userRow(result.data);
          var state = tableStates.get('usersTable');
          state.orderedRows[state.orderedRows.indexOf(row)] = replacement;
          row.replaceWith(replacement); renderTable(usersTable, state);
          usersMessage.textContent = 'Account status saved.';
        } else {
          usersMessage.textContent = result.error;
          actions.querySelectorAll('button').forEach(function (b) { b.disabled = user.account_status === 'banned' || (b.textContent === 'suspend' && user.account_status === 'suspended'); });
        }
      });
      actions.appendChild(button);
    });
    return row;
  }
  async function loadUsers() {
    usersMessage.textContent = 'Loading users...';
    var result = await EquipifyApi.get('/admin/users');
    if (!result.ok) {
      usersMessage.textContent = result.error + ' ';
      var retry = document.createElement('button'); retry.textContent = 'Retry'; retry.onclick = loadUsers; usersMessage.appendChild(retry); return;
    }
    var state = tableStates.get('usersTable');
    usersTable.tBodies[0].replaceChildren(); state.orderedRows = result.data.map(userRow);
    renderTable(usersTable, state);
    usersMessage.textContent = result.data.length ? result.data.length + ' users' : 'No operational users found.';
  }
  loadUsers();})();
