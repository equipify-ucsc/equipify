/* ==========================================================================
   Equipify — Shared equipment catalogue helper (vanilla JS, needs
   shared/api.js first)

   The catalogue is two levels: categories -> equipment types. Each type
   defines its own spec fields (Diesel Generator -> kVA, phase, ...). Several
   pages need the same three things from it, so they live here once:

     EquipifyCatalogue.load()                     categories + types, fetched once
     EquipifyCatalogue.fillCategorySelect(sel)    <option> per category
     EquipifyCatalogue.fillTypeSelect(sel, id)    <option> per type of a category
     EquipifyCatalogue.loadFields(typeId)         a type's spec field definitions
     EquipifyCatalogue.renderSpecInputs(el, fields, values)
                                                  form controls; returns
                                                  { read(), showErrors(fields) }
     EquipifyCatalogue.formatSpec(spec)           "25 kVA", "Yes", "Paddy, Vegetable"

   Everything is built with createElement + textContent; server data never
   goes through innerHTML.
   ========================================================================== */

(function () {
  'use strict';

  var cache = {};       // key ('all' | 'nonempty') -> Promise of categories
  var fieldCache = {};  // typeId -> Promise of the /fields payload

  /**
   * @param {Object} [opts]
   * @param {boolean} [opts.nonEmpty] only categories/types with listings
   * @returns {Promise<Array>} categories, each with .types (rejects never; [] on error)
   */
  function load(opts) {
    var nonEmpty = !!(opts && opts.nonEmpty);
    var key = nonEmpty ? 'nonempty' : 'all';
    if (!cache[key]) {
      cache[key] = EquipifyApi.query('/catalogue', { nonempty: nonEmpty ? '1' : '' }).then(function (res) {
        if (!res.ok) {
          delete cache[key];
          return [];
        }
        return res.data.categories;
      });
    }
    return cache[key];
  }

  function findCategory(categories, categoryId) {
    for (var i = 0; i < categories.length; i++) {
      if (String(categories[i].category_id) === String(categoryId)) return categories[i];
    }
    return null;
  }

  /** The category that holds a type, or null. */
  function categoryOfType(categories, typeId) {
    for (var i = 0; i < categories.length; i++) {
      for (var j = 0; j < categories[i].types.length; j++) {
        if (String(categories[i].types[j].type_id) === String(typeId)) return categories[i];
      }
    }
    return null;
  }

  function option(value, label) {
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    return opt;
  }

  /**
   * Replaces a select's options with one per category. The first option is
   * kept as the placeholder ("All categories" / "Select a category").
   */
  function fillCategorySelect(select, categories, placeholder) {
    var keep = placeholder !== undefined ? placeholder : (select.options[0] ? select.options[0].textContent : '');
    select.textContent = '';
    select.appendChild(option('', keep));
    categories.forEach(function (c) {
      select.appendChild(option(String(c.category_id), c.name));
    });
  }

  /** Replaces a select's options with the types of one category ("Other" last, as the API orders them). */
  function fillTypeSelect(select, categories, categoryId, placeholder) {
    select.textContent = '';
    select.appendChild(option('', placeholder || 'Select a type'));
    var category = findCategory(categories, categoryId);
    if (!category) {
      select.disabled = true;
      return;
    }
    select.disabled = false;
    category.types.forEach(function (t) {
      select.appendChild(option(String(t.type_id), t.name));
    });
  }

  /** @returns {Promise<Object|null>} { type_id, name, is_other, fields: [...] } */
  function loadFields(typeId) {
    var key = String(typeId);
    if (!fieldCache[key]) {
      fieldCache[key] = EquipifyApi.get('/catalogue/types/' + encodeURIComponent(key) + '/fields').then(function (res) {
        if (!res.ok) {
          delete fieldCache[key];
          return null;
        }
        return res.data;
      });
    }
    return fieldCache[key];
  }

  // ---------- spec inputs ----------

  /**
   * Builds one labelled control per spec field inside `container` (cleared
   * first). `values` maps field_key -> current value (number, string, bool
   * or array for multiselect). `classes` lets the page reuse its own form
   * classes: { field, label, input, full, error }.
   *
   * @returns {{read: function(): Object, showErrors: function(Object): void}}
   */
  function renderSpecInputs(container, fields, values, classes) {
    classes = classes || {};
    values = values || {};
    container.textContent = '';
    var readers = {};
    var errorEls = {};

    fields.forEach(function (field) {
      var id = 'spec_' + field.field_key;
      var wrap = document.createElement('div');
      wrap.className = (classes.field || 'field') + (field.data_type === 'multiselect' && classes.full ? ' ' + classes.full : '');

      var label = document.createElement(field.data_type === 'multiselect' ? 'span' : 'label');
      label.className = classes.label || 'field-label';
      if (field.data_type !== 'multiselect') label.htmlFor = id;
      label.textContent = field.label + (field.unit ? ' (' + field.unit + ')' : '') + (field.is_required ? ' *' : '');
      wrap.appendChild(label);

      var current = values[field.field_key];
      var control;

      if (field.data_type === 'number') {
        control = document.createElement('input');
        control.type = 'number';
        control.step = 'any';
        control.min = '0';
        control.value = current === undefined || current === null ? '' : String(current);
        readers[field.field_key] = function () { return control.value.trim(); };
      } else if (field.data_type === 'text') {
        control = document.createElement('input');
        control.type = 'text';
        control.maxLength = 255;
        control.value = current || '';
        readers[field.field_key] = function () { return control.value.trim(); };
      } else if (field.data_type === 'boolean') {
        control = document.createElement('select');
        control.appendChild(option('', field.is_required ? 'Select…' : 'Not stated'));
        control.appendChild(option('1', 'Yes'));
        control.appendChild(option('0', 'No'));
        control.value = current === true ? '1' : current === false ? '0' : '';
        readers[field.field_key] = function () {
          return control.value === '' ? '' : control.value === '1';
        };
      } else if (field.data_type === 'select') {
        control = document.createElement('select');
        control.appendChild(option('', field.is_required ? 'Select…' : 'Not stated'));
        (field.options || []).forEach(function (o) { control.appendChild(option(o, o)); });
        control.value = current || '';
        readers[field.field_key] = function () { return control.value; };
      } else {
        // multiselect: a group of checkboxes
        control = document.createElement('div');
        control.className = 'spec-checks';
        control.setAttribute('role', 'group');
        control.setAttribute('aria-label', field.label);
        var chosen = Array.isArray(current) ? current : [];
        var boxes = [];
        (field.options || []).forEach(function (o, i) {
          var item = document.createElement('label');
          item.className = 'spec-check';
          var box = document.createElement('input');
          box.type = 'checkbox';
          box.value = o;
          box.id = id + '_' + i;
          box.checked = chosen.indexOf(o) !== -1;
          var text = document.createElement('span');
          text.textContent = o;
          item.appendChild(box);
          item.appendChild(text);
          control.appendChild(item);
          boxes.push(box);
        });
        readers[field.field_key] = function () {
          return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
        };
      }

      if (field.data_type !== 'multiselect') {
        control.id = id;
        control.className = classes.input || 'input-standard';
        if (field.is_required) control.required = true;
      }
      wrap.appendChild(control);

      var error = document.createElement('p');
      error.className = classes.error || 'spec-error';
      error.hidden = true;
      error.setAttribute('role', 'alert');
      wrap.appendChild(error);
      errorEls[field.field_key] = error;

      container.appendChild(wrap);
    });

    return {
      read: function () {
        var out = {};
        Object.keys(readers).forEach(function (key) {
          var value = readers[key]();
          if (value === '' || (Array.isArray(value) && value.length === 0)) return;
          out[key] = value;
        });
        return out;
      },
      /** Shows the API's "spec.<field_key>" messages next to each control. */
      showErrors: function (apiFields) {
        Object.keys(errorEls).forEach(function (key) {
          var message = (apiFields || {})['spec.' + key];
          errorEls[key].textContent = message || '';
          errorEls[key].hidden = !message;
        });
      }
    };
  }

  /**
   * A stored spec value as text, with its unit: {data_type, value, unit}.
   * The API already formats values for display in `display`; this is the
   * fallback for values the page holds itself.
   */
  function formatSpec(spec) {
    if (spec.display) return spec.display;
    var v = spec.value;
    if (v === null || v === undefined || v === '') return '—';
    if (spec.data_type === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.join(', ');
    return String(v) + (spec.unit ? ' ' + spec.unit : '');
  }

  window.EquipifyCatalogue = {
    load: load,
    findCategory: findCategory,
    categoryOfType: categoryOfType,
    fillCategorySelect: fillCategorySelect,
    fillTypeSelect: fillTypeSelect,
    loadFields: loadFields,
    renderSpecInputs: renderSpecInputs,
    formatSpec: formatSpec
  };
})();
