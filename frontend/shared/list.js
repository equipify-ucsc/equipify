/* ==========================================================================
   Equipify — Shared paged list (vanilla JS, needs shared/api.js first)

   Every list in the portal does the same four things: fetch a page from a
   list endpoint, let the user search and filter it, render the rows, and draw
   a pager. Rather than copy that into each page's script.js, a page describes
   its list once:

     var list = EquipifyList.create({
       endpoint: '/freelancer/jobs',
       container: document.querySelector('#jobTable tbody'),
       searchInput: document.getElementById('jobSearch'),
       filters: { status: document.getElementById('statusFilter') },
       pager: document.getElementById('jobPager'),
       columns: 6,                       // colspan for table state rows
       emptyMessage: 'No jobs yet.',
       renderItem: function (job) { ... return element; }
     });

   Search and filters are sent to the server as query params (?q=&status=&page=),
   never applied to already-rendered rows, so paging stays correct: filtering
   narrows the whole result set, not just the page you happen to be looking at.
   Changing any control resets to page 1.

   Rows are built with createElement + textContent by the caller's renderItem;
   nothing here ever assigns innerHTML from server data.
   ========================================================================== */

(function () {
  'use strict';

  var SEARCH_DEBOUNCE_MS = 250;

  /**
   * @param {Object} options
   * @param {string} options.endpoint      list endpoint path
   * @param {Element} options.container    where rows/cards are appended
   * @param {Function} options.renderItem  (item, index) => Element
   * @param {Element} [options.searchInput]
   * @param {Object} [options.filters]     { paramName: <select|input> }
   * @param {Element} [options.pager]
   * @param {Element} [options.countLabel] gets "37 results"
   * @param {number} [options.perPage]
   * @param {number} [options.columns]     table colspan for state rows
   * @param {string} [options.emptyMessage]
   * @param {Object} [options.extraParams] fixed params merged into every request
   * @param {Function} [options.onLoad]    (data) => void, for summary tiles etc.
   */
  function create(options) {
    var container = options.container;
    if (!container) return null;

    var state = {
      page: 1,
      perPage: options.perPage || 10,
      q: '',
      filters: {},
      extra: options.extraParams || {}
    };

    // A page is only rendered if it is still the newest request: a slow reply
    // for page 1 must not overwrite the page 2 the user already asked for.
    var requestId = 0;

    // ---------- state rows ----------
    // Inside a <tbody> the placeholder has to be a <tr><td colspan>; anywhere
    // else a plain <p> is right.
    function stateElement(text, modifier) {
      var isTableBody = container.tagName === 'TBODY';
      var node = document.createElement(isTableBody ? 'td' : 'p');
      node.className = 'list-state' + (modifier ? ' list-state--' + modifier : '');
      node.textContent = text;
      if (!isTableBody) return node;

      node.colSpan = options.columns || 1;
      var row = document.createElement('tr');
      row.appendChild(node);
      return row;
    }

    function showState(text, modifier) {
      container.textContent = '';
      container.appendChild(stateElement(text, modifier));
    }

    // ---------- pager ----------
    /**
     * Which page numbers to draw: always the first and last, always the current
     * page with one neighbour either side, and an ellipsis for each run that is
     * skipped. So 1 … 4 [5] 6 … 20, a fixed width however long the list gets.
     *
     * @returns {Array<number|string>} page numbers, with '…' for a gap
     */
    function pageNumbers(current, totalPages) {
      var WINDOW = 1; // neighbours shown either side of the current page
      var wanted = {};
      var i;

      wanted[1] = true;
      wanted[totalPages] = true;
      for (i = current - WINDOW; i <= current + WINDOW; i++) {
        if (i >= 1 && i <= totalPages) wanted[i] = true;
      }

      var out = [];
      var previous = 0;
      for (i = 1; i <= totalPages; i++) {
        if (!wanted[i]) continue;
        if (previous && i - previous > 1) out.push('…');
        out.push(i);
        previous = i;
      }
      return out;
    }

    function renderPager(data) {
      if (!options.pager) return;
      options.pager.textContent = '';
      // One page of results needs no pager at all.
      if (data.total === 0 || (data.total_pages || 1) <= 1) return;

      var totalPages = data.total_pages || 1;

      var nav = document.createElement('nav');
      nav.className = 'pager-nav';
      nav.setAttribute('aria-label', 'Pagination');

      nav.appendChild(arrowButton('Previous page', 'chevron_left', data.page <= 1, function () {
        go(data.page - 1);
      }));

      pageNumbers(data.page, totalPages).forEach(function (entry) {
        nav.appendChild(entry === '…' ? pagerGap() : numberButton(entry, entry === data.page));
      });

      nav.appendChild(arrowButton('Next page', 'chevron_right', data.page >= totalPages, function () {
        go(data.page + 1);
      }));

      options.pager.appendChild(nav);
    }

    /** A numbered page button; the current page is marked, not clickable. */
    function numberButton(page, isCurrent) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'pager-num' + (isCurrent ? ' is-current' : '');
      button.textContent = String(page);
      if (isCurrent) {
        button.setAttribute('aria-current', 'page');
        button.disabled = true;
      } else {
        button.setAttribute('aria-label', 'Go to page ' + page);
        button.addEventListener('click', function () { go(page); });
      }
      return button;
    }

    /** The "…" standing in for a run of skipped page numbers. */
    function pagerGap() {
      var span = document.createElement('span');
      span.className = 'pager-gap';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = '…';
      return span;
    }

    /** Previous / Next. Icon only, because the number buttons carry the labelling. */
    function arrowButton(label, icon, disabled, onClick) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'pager-btn';
      button.disabled = disabled;
      button.setAttribute('aria-label', label);

      var glyph = document.createElement('span');
      glyph.className = 'icon icon-sm';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = icon;
      button.appendChild(glyph);

      button.addEventListener('click', onClick);
      return button;
    }

    function setCount(total) {
      if (!options.countLabel) return;
      options.countLabel.textContent = total === 1 ? '1 result' : total + ' results';
    }

    // ---------- fetching ----------
    function params() {
      var query = { page: state.page, per_page: state.perPage, q: state.q };
      Object.keys(state.extra).forEach(function (key) { query[key] = state.extra[key]; });
      Object.keys(state.filters).forEach(function (key) { query[key] = state.filters[key]; });
      return query;
    }

    function load() {
      var id = ++requestId;
      showState('Loading…', 'loading');

      return EquipifyApi.query(options.endpoint, params()).then(function (res) {
        if (id !== requestId) return;

        if (!res.ok) {
          showState(res.error, 'error');
          if (options.pager) options.pager.textContent = '';
          setCount(0);
          return;
        }

        var data = res.data;
        setCount(data.total);

        container.textContent = '';
        if (!data.items.length) {
          container.appendChild(stateElement(options.emptyMessage || 'Nothing to show yet.', 'empty'));
        } else {
          data.items.forEach(function (item, index) {
            var element = options.renderItem(item, index);
            if (element) container.appendChild(element);
          });
        }

        renderPager(data);
        if (options.onLoad) options.onLoad(data);
      });
    }

    function go(page) {
      state.page = page < 1 ? 1 : page;
      load();
      // Bring the top of the list back into view after a page change.
      if (container.scrollIntoView) {
        container.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    /** Any control change restarts at page 1, since page 3 of the old filter is meaningless. */
    function reset() {
      state.page = 1;
      load();
    }

    // ---------- controls ----------
    if (options.searchInput) {
      var debounce;
      options.searchInput.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          state.q = options.searchInput.value.trim();
          reset();
        }, SEARCH_DEBOUNCE_MS);
      });
    }

    Object.keys(options.filters || {}).forEach(function (param) {
      var control = options.filters[param];
      if (!control) return;
      state.filters[param] = controlValue(control);
      control.addEventListener('change', function () {
        state.filters[param] = controlValue(control);
        reset();
      });
    });

    function controlValue(control) {
      if (control.type === 'checkbox') return control.checked ? '1' : '';
      return control.value;
    }

    load();

    return {
      reload: load,
      reset: reset,
      /**
       * Swap a fixed param (e.g. the Job Offers tab) and start again at page 1.
       * Pass defer=true when another change follows, so the list is fetched once.
       */
      setParam: function (key, value, defer) {
        state.extra[key] = value;
        if (!defer) reset();
      },
      /** Set a filter from code, keeping its control in step. */
      setFilter: function (param, value, defer) {
        state.filters[param] = value;
        var control = (options.filters || {})[param];
        if (control) {
          if (control.type === 'checkbox') {
            control.checked = value === '1';
          } else {
            control.value = value;
          }
        }
        if (!defer) reset();
      },
      currentPage: function () { return state.page; }
    };
  }

  window.EquipifyList = { create: create };
})();
