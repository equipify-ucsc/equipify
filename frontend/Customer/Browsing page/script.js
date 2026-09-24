// Equipify — Browse Equipment (vanilla JS)
//
// Search first, then filters in steps, so a customer never faces more than a
// handful of choices at once:
//   always   daily rate, district, available now, delivery
//   step 1   category (only categories that have listings, with counts)
//   step 2   equipment type of that category (shown once a category is picked)
//   step 3   up to 3 spec filters of that type (shown once a type is picked;
//            the API sends their definitions back as spec_filters)
// Every filter lives in the URL (?category=4&type=34&spec_phase=Three-phase),
// so a filtered view can be bookmarked, shared, or returned to from a detail
// page. Listings are fetched page by page through shared/list.js.

(function () {
  'use strict';

  const FIXED_KEYS = ['q', 'category', 'type', 'district', 'min_price', 'max_price', 'available', 'delivery', 'sort'];

  const grid = document.getElementById('equipment-grid');
  if (!grid) return;

  const els = {
    categoryFilter: document.getElementById('category-filter'),
    typeSection: document.getElementById('type-filter-section'),
    typeFilter: document.getElementById('type-filter'),
    specSection: document.getElementById('spec-filter-section'),
    specFilters: document.getElementById('spec-filters'),
    minPrice: document.getElementById('min-price'),
    maxPrice: document.getElementById('max-price'),
    available: document.getElementById('available-only'),
    delivery: document.getElementById('delivery-only'),
    district: document.getElementById('location-select'),
    sort: document.getElementById('sort'),
    tiles: document.getElementById('category-tiles'),
    crumbs: document.getElementById('filter-crumbs'),
    title: document.getElementById('results-title'),
    searchInputs: [document.getElementById('nav-search-input'), document.getElementById('mobile-search-input')]
  };

  let categories = [];
  let params = readUrl();
  let sentKeys = Object.keys(params);
  let renderedSpecType = null;
  let list = null;

  // ---------- small DOM helpers ----------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function msym(name) {
    const span = el('span', 'msym', name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  function lkr(amount) {
    return 'LKR ' + Number(amount).toLocaleString('en-LK', { maximumFractionDigits: 2 });
  }

  // ---------- URL <-> params ----------
  function readUrl() {
    const out = {};
    new URLSearchParams(window.location.search).forEach((value, key) => {
      if (value !== '' && (FIXED_KEYS.includes(key) || key.indexOf('spec_') === 0)) out[key] = value;
    });
    return out;
  }
  function writeUrl() {
    const query = new URLSearchParams();
    Object.keys(params).forEach((key) => { if (params[key] !== '') query.set(key, params[key]); });
    const text = query.toString();
    window.history.replaceState(null, '', text ? '?' + text : window.location.pathname);
  }
  function clearSpecParams() {
    Object.keys(params).forEach((key) => { if (key.indexOf('spec_') === 0) delete params[key]; });
  }
  function set(key, value) {
    if (value === '' || value === null || value === undefined || value === false) {
      delete params[key];
    } else {
      params[key] = String(value);
    }
  }

  /** Sends the current params to the list (page 1) and redraws the filter UI. */
  function refresh() {
    const keys = new Set(sentKeys.concat(Object.keys(params)));
    keys.forEach((key) => list.setParam(key, params[key] || '', true));
    sentKeys = Object.keys(params);
    list.reset();
    writeUrl();
    renderSteps();
  }

  // ---------- catalogue lookups ----------
  function currentCategory() {
    return categories.find((c) => String(c.category_id) === params.category) || null;
  }
  function currentType() {
    const c = currentCategory();
    return c ? c.types.find((t) => String(t.type_id) === params.type) || null : null;
  }

  // ---------- step 1 + 2: category and type radios, tiles, crumbs ----------
  function radio(name, value, label, count, checked, onPick) {
    const option = el('label', 'filter-option');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;
    input.addEventListener('change', () => { if (input.checked) onPick(value); });
    option.appendChild(input);
    option.appendChild(el('span', 'filter-option__label', label));
    if (count !== null) option.appendChild(el('span', 'filter-option__count', String(count)));
    return option;
  }

  function pickCategory(id) {
    set('category', id);
    delete params.type;
    clearSpecParams();
    refresh();
  }
  function pickType(id) {
    set('type', id);
    clearSpecParams();
    refresh();
  }

  function renderSteps() {
    const category = currentCategory();
    const type = currentType();

    // Step 1
    els.categoryFilter.textContent = '';
    if (!categories.length) {
      els.categoryFilter.appendChild(el('p', 'filter-note', 'No equipment has been listed yet.'));
    } else {
      els.categoryFilter.appendChild(radio('category', '', 'All categories', null, !category, pickCategory));
      categories.forEach((c) => {
        els.categoryFilter.appendChild(radio('category', String(c.category_id), c.name, c.listing_count, category === c, pickCategory));
      });
    }

    // Step 2
    els.typeSection.hidden = !category;
    els.typeFilter.textContent = '';
    if (category) {
      els.typeFilter.appendChild(radio('type', '', 'All ' + category.name, null, !type, pickType));
      category.types.forEach((t) => {
        els.typeFilter.appendChild(radio('type', String(t.type_id), t.name, t.listing_count, type === t, pickType));
      });
    }

    // Step 3 is drawn from the API's spec_filters (see renderSpecFilters)
    if (!type) {
      els.specSection.hidden = true;
      els.specFilters.textContent = '';
      renderedSpecType = null;
    }

    // Tiles
    els.tiles.querySelectorAll('.category-tile').forEach((tile) => {
      tile.setAttribute('aria-pressed', tile.dataset.categoryId === params.category ? 'true' : 'false');
    });

    // Title + breadcrumb
    els.title.textContent = type ? type.name : category ? category.name : 'Browse Equipment';
    els.crumbs.textContent = '';
    const crumbs = [];
    if (params.q) crumbs.push(['“' + params.q + '”', () => { delete params.q; els.searchInputs.forEach((i) => { if (i) i.value = ''; }); refresh(); }]);
    if (category) crumbs.push([category.name, () => pickCategory('')]);
    if (type) crumbs.push([type.name, () => pickType('')]);
    crumbs.forEach(([label, clear], i) => {
      if (i > 0) els.crumbs.appendChild(el('span', 'filter-crumbs__sep', '›'));
      const crumb = el('span', 'filter-crumb', label);
      const x = el('button', 'filter-crumb__clear');
      x.type = 'button';
      x.setAttribute('aria-label', 'Clear ' + label);
      x.appendChild(msym('close'));
      x.addEventListener('click', clear);
      crumb.appendChild(x);
      els.crumbs.appendChild(crumb);
    });
    els.crumbs.hidden = crumbs.length === 0;
  }

  function renderTiles() {
    els.tiles.textContent = '';
    categories.forEach((c) => {
      const tile = el('button', 'category-tile');
      tile.type = 'button';
      tile.dataset.categoryId = String(c.category_id);
      tile.appendChild(msym(c.icon));
      tile.appendChild(el('span', 'category-tile__name', c.name));
      tile.appendChild(el('span', 'category-tile__count', c.listing_count + (c.listing_count === 1 ? ' listing' : ' listings')));
      tile.addEventListener('click', () => pickCategory(params.category === String(c.category_id) ? '' : String(c.category_id)));
      els.tiles.appendChild(tile);
    });
  }

  // ---------- step 3: spec filters ----------
  function renderSpecFilters(fields) {
    if (!params.type || renderedSpecType === params.type) return;
    renderedSpecType = params.type;
    els.specFilters.textContent = '';
    els.specSection.hidden = fields.length === 0;

    fields.forEach((field) => {
      const key = 'spec_' + field.field_key;
      const wrap = el('div', 'spec-filter');
      const label = el('span', 'spec-filter__label', field.label + (field.unit ? ' (' + field.unit + ')' : ''));
      label.id = key + '_label';
      wrap.appendChild(label);

      if (field.data_type === 'number') {
        const pair = el('div', 'range-pair');
        ['min', 'max'].forEach((bound, i) => {
          if (i === 1) pair.appendChild(el('span', 'range-pair__dash', '–'));
          const field_ = el('label', 'range-pair__field');
          const sr = el('span', 'sr-only', (bound === 'min' ? 'Minimum ' : 'Maximum ') + field.label);
          const input = el('input', 'select-field');
          input.type = 'number';
          input.step = 'any';
          input.placeholder = bound === 'min' ? 'Min' : 'Max';
          input.value = params[key + '_' + bound] || '';
          input.addEventListener('change', () => { set(key + '_' + bound, input.value.trim()); refresh(); });
          field_.appendChild(sr);
          field_.appendChild(input);
          pair.appendChild(field_);
        });
        wrap.appendChild(pair);
      } else {
        const select = el('select', 'select-field');
        select.setAttribute('aria-labelledby', label.id);
        select.appendChild(new Option('Any', ''));
        const options = field.data_type === 'boolean' ? [['1', 'Yes'], ['0', 'No']] : (field.options || []).map((o) => [o, o]);
        options.forEach(([value, text]) => select.appendChild(new Option(text, value)));
        select.value = params[key] || '';
        select.addEventListener('change', () => { set(key, select.value); refresh(); });
        wrap.appendChild(select);
      }
      els.specFilters.appendChild(wrap);
    });
  }

  // ---------- cards ----------
  const HEART = 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z';

  function heartButton() {
    const button = el('button', 'card__wishlist');
    button.type = 'button';
    button.setAttribute('aria-label', 'Add to wishlist');
    button.setAttribute('data-wishlist-toggle', '');
    const icon = el('span', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', HEART);
    svg.appendChild(path);
    icon.appendChild(svg);
    button.appendChild(icon);
    button.addEventListener('click', () => {
      const active = button.classList.toggle('is-active');
      icon.classList.toggle('icon--fill', active);
      button.setAttribute('aria-label', active ? 'Remove from wishlist' : 'Add to wishlist');
    });
    return button;
  }

  function renderCard(item) {
    const detailUrl = '../Detailed page/index.html?id=' + encodeURIComponent(item.equipment_id);
    const card = el('article', 'card');

    if (item.status === 'available') {
      card.appendChild(el('div', 'card__badge', 'Available Now'));
    } else {
      card.appendChild(el('div', 'card__badge card__badge--muted', item.status === 'on_rent' ? 'On Rent' : 'In Maintenance'));
    }
    card.appendChild(heartButton());

    const imageWrap = el('div', 'card__image-wrap');
    if (item.cover_photo_url) {
      const img = el('img', 'card__image');
      img.src = EquipifyApi.url(item.cover_photo_url);
      img.alt = item.title;
      img.loading = 'lazy';
      imageWrap.appendChild(img);
    } else {
      const placeholder = el('div', 'card__image-placeholder');
      placeholder.appendChild(msym(item.category_icon || 'construction'));
      imageWrap.appendChild(placeholder);
    }
    card.appendChild(imageWrap);

    const body = el('div', 'card__body');
    body.appendChild(el('p', 'card__type', item.type_name));
    body.appendChild(el('h3', 'card__title', item.title));
    const provider = el('p', 'card__provider', 'by ');
    provider.appendChild(el('span', null, item.business_name));
    body.appendChild(provider);

    const price = el('div', 'card__price', lkr(item.daily_rate_lkr) + ' ');
    price.appendChild(el('span', 'card__price-unit', '/ day'));
    body.appendChild(price);

    const footer = el('div', 'card__footer');
    const row = el('div', 'card__location-row');
    const chip = el('span', 'location-chip');
    chip.appendChild(el('span', 'location-chip__dot location-chip__dot--' + (item.status === 'available' ? 'green' : 'amber')));
    chip.appendChild(document.createTextNode(' ' + item.district));
    row.appendChild(chip);
    footer.appendChild(row);
    const view = el('a', 'btn btn--primary', 'View Details');
    view.href = detailUrl;
    footer.appendChild(view);
    body.appendChild(footer);
    card.appendChild(body);
    return card;
  }

  // ---------- always-shown filters ----------
  function bindFixed() {
    els.minPrice.value = params.min_price || '';
    els.maxPrice.value = params.max_price || '';
    els.available.checked = params.available === '1';
    els.delivery.checked = params.delivery === '1';
    els.district.value = params.district || '';
    els.sort.value = params.sort || 'recent';
    els.searchInputs.forEach((i) => { if (i) i.value = params.q || ''; });

    els.minPrice.addEventListener('change', () => { set('min_price', els.minPrice.value.trim()); refresh(); });
    els.maxPrice.addEventListener('change', () => { set('max_price', els.maxPrice.value.trim()); refresh(); });
    els.available.addEventListener('change', () => { set('available', els.available.checked ? '1' : ''); refresh(); });
    els.delivery.addEventListener('change', () => { set('delivery', els.delivery.checked ? '1' : ''); refresh(); });
    els.district.addEventListener('change', () => { set('district', els.district.value); refresh(); });
    els.sort.addEventListener('change', () => { set('sort', els.sort.value === 'recent' ? '' : els.sort.value); refresh(); });

    // Search: on Enter / the Search button, and after a pause in typing.
    let debounce;
    els.searchInputs.forEach((input) => {
      if (!input) return;
      const search = () => {
        clearTimeout(debounce);
        els.searchInputs.forEach((other) => { if (other && other !== input) other.value = input.value; });
        if ((params.q || '') === input.value.trim()) return;
        set('q', input.value.trim());
        refresh();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
      input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(search, 400); });
      const button = input.parentElement.querySelector('.nav-search__button');
      if (button) button.addEventListener('click', search);
    });

    document.getElementById('clear-filters').addEventListener('click', () => {
      params = {};
      bindValuesFromParams();
      refresh();
    });
  }

  function bindValuesFromParams() {
    els.minPrice.value = '';
    els.maxPrice.value = '';
    els.available.checked = false;
    els.delivery.checked = false;
    els.district.value = '';
    els.sort.value = 'recent';
    els.searchInputs.forEach((i) => { if (i) i.value = ''; });
  }

  // ---------- mobile panels (search overlay + filter drawer) ----------
  function initMobilePanels() {
    const searchToggle = document.getElementById('mobile-search-toggle');
    const searchPanel = document.getElementById('mobile-search-panel');
    const filterToggle = document.getElementById('mobile-filter-toggle');
    const sidebar = document.getElementById('filters-sidebar');
    const sidebarClose = document.getElementById('sidebar-close');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (searchToggle && searchPanel) {
      searchToggle.addEventListener('click', () => {
        const isOpen = !searchPanel.hidden;
        searchPanel.hidden = isOpen;
        searchToggle.setAttribute('aria-expanded', String(!isOpen));
        if (!isOpen) {
          const input = searchPanel.querySelector('input');
          if (input) input.focus();
        }
      });
    }

    function openSidebar() {
      sidebar.classList.add('is-open');
      if (backdrop) backdrop.hidden = false;
      if (filterToggle) filterToggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
    function closeSidebar() {
      sidebar.classList.remove('is-open');
      if (backdrop) backdrop.hidden = true;
      if (filterToggle) filterToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
    if (filterToggle && sidebar) filterToggle.addEventListener('click', openSidebar);
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sidebar && sidebar.classList.contains('is-open')) closeSidebar();
    });
  }

  // ---------- start ----------
  initMobilePanels();
  bindFixed();

  list = EquipifyList.create({
    endpoint: '/equipment',
    container: grid,
    pager: document.getElementById('equipment-pager'),
    countLabel: document.getElementById('result-count'),
    perPage: 12,
    extraParams: Object.assign({}, params),
    emptyMessage: 'No equipment matches these filters. Try removing one.',
    renderItem: renderCard,
    onLoad: (data) => renderSpecFilters(data.spec_filters || [])
  });

  EquipifyCatalogue.load({ nonEmpty: true }).then((result) => {
    categories = result;
    renderTiles();
    renderSteps();
  });
})();
