/* ==========================================================================
   Equipify — Renting Party My Equipment
   The renting party's listings from the API: search, category/status/sort
   filters, status summary chips, pager, and remove. Vanilla JS, no
   dependencies. Mobile navigation drawer behavior lives in
   ../../shared/script.js; the paged list in ../../shared/list.js.
   ========================================================================== */

(function () {
  'use strict';

  var BADGES = {
    available: 'badge-available',
    on_rent: 'badge-on-rent',
    maintenance: 'badge-maintenance',
    retired: 'badge-retired'
  };

  var grid = document.getElementById('equipmentGrid');
  var categoryFilter = document.getElementById('categoryFilter');
  var statusFilter = document.getElementById('statusFilter');
  if (!grid) return;

  // ---------- Toast ----------
  var toastTimer;
  function showToast(message) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 2600);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function icon(name) {
    var span = el('span', 'icon', name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  function lkr(amount) {
    return 'LKR ' + Number(amount).toLocaleString('en-LK', { maximumFractionDigits: 2 });
  }

  // ---------- Card ----------
  function renderCard(item) {
    var card = el('div', 'card equipment-card');
    var editUrl = '../Equipment Details/index.html?id=' + encodeURIComponent(item.equipment_id);

    var imageWrap = el('div', 'card-image-wrapper');
    if (item.cover_photo_url) {
      var img = el('img');
      img.src = EquipifyApi.url(item.cover_photo_url);
      img.alt = item.title;
      img.loading = 'lazy';
      imageWrap.appendChild(img);
    } else {
      var placeholder = el('div', 'card-image-placeholder');
      placeholder.appendChild(icon(item.category_icon || 'inventory_2'));
      placeholder.appendChild(el('span', null, 'No photo yet'));
      imageWrap.appendChild(placeholder);
    }
    imageWrap.appendChild(el('span', 'status-badge ' + (BADGES[item.status] || ''), item.status_label));
    card.appendChild(imageWrap);

    var body = el('div', 'card-body');
    var titleRow = el('div', 'card-title-row');
    titleRow.appendChild(el('h3', null, item.title));
    var price = el('div', 'price-box');
    price.appendChild(el('span', 'price-amount', lkr(item.daily_rate_lkr)));
    price.appendChild(el('span', 'price-unit', ' / day'));
    titleRow.appendChild(price);
    body.appendChild(titleRow);

    body.appendChild(el('div', 'card-category', item.category_name.toUpperCase()));
    body.appendChild(el('div', 'card-type', item.type_name + (item.quantity > 1 ? ' · ' + item.quantity + ' units' : '')));

    var meta = el('div', 'card-meta');
    var row1 = el('div', 'meta-row');
    row1.appendChild(icon('location_on'));
    row1.appendChild(el('span', null, item.district));
    meta.appendChild(row1);
    var row2 = el('div', 'meta-row');
    row2.appendChild(icon('verified'));
    row2.appendChild(el('span', null, item.condition_label + ' condition'));
    meta.appendChild(row2);
    body.appendChild(meta);

    var footer = el('div', 'card-footer');
    var view = el('a', 'view-details', item.status === 'retired' ? 'View' : 'View & Edit ');
    view.href = editUrl;
    if (item.status !== 'retired') view.appendChild(icon('arrow_forward'));
    footer.appendChild(view);

    var actions = el('div', 'card-actions');
    if (item.status !== 'retired') {
      var edit = el('a', 'action-btn');
      edit.href = editUrl;
      edit.title = 'Edit';
      edit.setAttribute('aria-label', 'Edit ' + item.title);
      edit.appendChild(icon('edit'));
      actions.appendChild(edit);

      var remove = el('button', 'action-btn action-btn--danger');
      remove.type = 'button';
      remove.title = 'Remove';
      remove.setAttribute('aria-label', 'Remove ' + item.title);
      remove.appendChild(icon('delete'));
      remove.addEventListener('click', function () { removeListing(item); });
      actions.appendChild(remove);
    }
    footer.appendChild(actions);
    body.appendChild(footer);
    card.appendChild(body);
    return card;
  }

  function removeListing(item) {
    if (!window.confirm('Remove "' + item.title + '"? Customers will no longer see it.')) return;
    EquipifyApi.del('/renting-party/equipment/' + item.equipment_id).then(function (res) {
      if (!res.ok) { showToast(res.error); return; }
      showToast(res.data.outcome === 'retired'
        ? '"' + item.title + '" has rental history, so it was hidden instead of deleted.'
        : '"' + item.title + '" removed.');
      list.reload();
    });
  }

  // ---------- Status summary chips ----------
  var chips = document.querySelectorAll('.summary-chip');
  function renderSummary(counts) {
    var all = counts.available + counts.on_rent + counts.maintenance;
    document.querySelector('[data-count="all"]').textContent = String(all);
    ['available', 'on_rent', 'maintenance'].forEach(function (s) {
      document.querySelector('[data-count="' + s + '"]').textContent = String(counts[s]);
    });
  }
  function markChip() {
    chips.forEach(function (chip) {
      var on = chip.dataset.status === statusFilter.value;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      list.setFilter('status', chip.dataset.status);
      markChip();
    });
  });
  statusFilter.addEventListener('change', markChip);

  // ---------- List ----------
  var list = EquipifyList.create({
    endpoint: '/renting-party/equipment',
    container: grid,
    searchInput: document.getElementById('equipmentSearch'),
    filters: {
      category: categoryFilter,
      status: statusFilter,
      sort: document.getElementById('sortFilter')
    },
    pager: document.getElementById('equipmentPager'),
    countLabel: document.getElementById('resultCount'),
    perPage: 9,
    emptyMessage: 'No equipment here yet. Use "Add Equipment" to list your first item.',
    renderItem: renderCard,
    onLoad: function (data) { renderSummary(data.status_counts); }
  });
  markChip();

  EquipifyCatalogue.load().then(function (categories) {
    EquipifyCatalogue.fillCategorySelect(categoryFilter, categories, 'All Categories');
  });
})();
