/* ==========================================================================
   Equipify — Freelance Worker portal helpers (vanilla JS, no dependencies)

   Loaded by every page in this folder, after ../../shared/list.js and before
   the page's own script.js. Holds the pieces the other role folders copy-paste
   into each page script: the toast, the modal wiring, the "coming soon" stub
   links, plus the status→badge lookups and the formatters this portal needs,
   so ten pages agree on how a date, a rupee amount and a status look.

   Status vocabularies come from the schema enums where the table exists
   (freelance_workers.availability_status, credential_docs.verification_status)
   and otherwise from the placeholder API, which uses the values the future
   migration will adopt.
   ========================================================================== */

(function () {
  'use strict';

  // ---------- Toast ----------
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

  // ---------- Stub links (sections that need tables the schema doesn't have) ----------
  document.querySelectorAll('.is-stub').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var label = link.getAttribute('data-stub-label') || 'This section';
      window.showToast(label + ' is coming soon.');
    });
  });

  // ---------- Modals ----------
  function openModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.add('is-open');
    return modal;
  }
  function closeModal(modal) {
    if (modal) modal.classList.remove('is-open');
  }

  document.querySelectorAll('[data-modal-open]').forEach(function (btn) {
    btn.addEventListener('click', function () { openModal(btn.dataset.modalOpen); });
  });
  document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeModal(btn.closest('.modal-backdrop')); });
  });
  document.querySelectorAll('.modal-backdrop').forEach(function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal(modal);
    });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.modal-backdrop.is-open').forEach(closeModal);
  });

  // ---------- Status vocabularies ----------
  // Each entry maps a stored value to its label and the badge modifier the
  // design system already defines (active / pending / rejected / draft / completed).
  var STATUS = {
    availability: {
      available:   { label: 'Available',   badge: 'active' },
      busy:        { label: 'Busy',        badge: 'pending' },
      unavailable: { label: 'Unavailable', badge: 'rejected' }
    },
    verification: {
      pending:  { label: 'Pending review', badge: 'pending' },
      verified: { label: 'Verified',       badge: 'active' },
      rejected: { label: 'Rejected',       badge: 'rejected' }
    },
    offer: {
      open: { label: 'Open', badge: 'active' },
      // An operator never sets this: the customer picks a bid, and the offer
      // they picked is the one that reads "Awarded".
      accepted: { label: 'Awarded',  badge: 'completed' },
      declined: { label: 'Declined', badge: 'rejected' },
      expired:  { label: 'Expired',  badge: 'draft' }
    },
    bid: {
      submitted:   { label: 'Submitted',   badge: 'pending' },
      shortlisted: { label: 'Shortlisted', badge: 'completed' },
      won:         { label: 'Won',         badge: 'active' },
      lost:        { label: 'Lost',        badge: 'rejected' }
    },
    job: {
      in_progress: { label: 'In progress', badge: 'pending' },
      completed:   { label: 'Completed',   badge: 'active' },
      cancelled:   { label: 'Cancelled',   badge: 'rejected' }
    },
    payment: {
      paid:    { label: 'Paid',    badge: 'active' },
      pending: { label: 'Pending', badge: 'pending' },
      failed:  { label: 'Failed',  badge: 'rejected' }
    },
    complaint: {
      submitted:    { label: 'Submitted',    badge: 'pending' },
      under_review: { label: 'Under review', badge: 'completed' },
      resolved:     { label: 'Resolved',     badge: 'active' },
      dismissed:    { label: 'Dismissed',    badge: 'draft' }
    },
    notificationType: {
      job:     { label: 'Job',     badge: 'active' },
      bid:     { label: 'Bid',     badge: 'pending' },
      payment: { label: 'Payment', badge: 'completed' }
    },
    docType: {
      nic:                      'NIC',
      driving_license:          'Driving licence',
      professional_certificate: 'Professional certificate',
      business_registration:    'Business registration',
      other:                    'Other document'
    }
  };

  /** A <span class="badge-status"> for a stored status value. */
  function badge(vocabulary, value) {
    var entry = (STATUS[vocabulary] || {})[value] || { label: value || '—', badge: 'draft' };
    var span = document.createElement('span');
    span.className = 'badge-status badge-status--' + entry.badge;
    span.textContent = entry.label;
    return span;
  }

  /** Just the human label, for places that aren't a badge. */
  function label(vocabulary, value) {
    var group = STATUS[vocabulary] || {};
    var entry = group[value];
    if (entry === undefined) return value || '—';
    return typeof entry === 'string' ? entry : entry.label;
  }

  // ---------- Formatters ----------
  /** 45000 -> "Rs 45,000.00"; null/undefined -> "—". */
  function money(amount) {
    if (amount === null || amount === undefined || amount === '') return '—';
    return 'Rs ' + Number(amount).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /** "2026-09-22" -> "22 Sep 2026". Anything unparseable is returned as-is. */
  function date(value) {
    if (!value) return '—';
    var parsed = new Date(String(value).replace(' ', 'T'));
    if (isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /** "2026-09-22 14:05" -> "22 Sep 2026, 14:05". */
  function dateTime(value) {
    if (!value) return '—';
    var parsed = new Date(String(value).replace(' ', 'T'));
    if (isNaN(parsed.getTime())) return String(value);
    return date(value) + ', ' + parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- Small DOM builders ----------
  /** <td>text</td>, optionally wrapped in <strong> or given a class. */
  function cell(text, options) {
    var td = document.createElement('td');
    var settings = options || {};
    if (settings.className) td.className = settings.className;
    if (settings.strong) {
      var strong = document.createElement('strong');
      strong.textContent = text;
      td.appendChild(strong);
    } else {
      td.textContent = text;
    }
    return td;
  }

  /** A <td> holding one element (a badge, a button row, …). */
  function cellWith(element) {
    var td = document.createElement('td');
    td.appendChild(element);
    return td;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /** A Material Symbols glyph. */
  function icon(name, className) {
    var span = document.createElement('span');
    span.className = 'icon ' + (className || 'icon-sm');
    span.setAttribute('aria-hidden', 'true');
    span.textContent = name;
    return span;
  }

  function button(text, className, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  /** Filled/empty stars for a 0–5 rating. */
  function stars(rating) {
    var wrap = element('span', 'stars');
    wrap.setAttribute('aria-label', Number(rating).toFixed(1) + ' out of 5');
    for (var i = 1; i <= 5; i++) {
      var glyph = icon(i <= Math.round(rating) ? 'star' : 'star_border');
      wrap.appendChild(glyph);
    }
    return wrap;
  }

  /**
   * Shows the per-field messages the API returns ({fields: {email: '…'}}) in a
   * form's single error paragraph, which is the convention the existing forms use.
   */
  function showFormError(errorEl, res) {
    if (!errorEl) return;
    var details = Object.keys(res.fields || {}).map(function (key) { return res.fields[key]; });
    errorEl.textContent = details.length ? details.join(' ') : res.error;
    errorEl.hidden = false;
  }

  /**
   * Reads a File into the { name, data } base64 shape core/Upload.php expects.
   * @returns {Promise<{name:string,data:string}>}
   */
  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // "data:application/pdf;base64,JVBERi0x..." -> "JVBERi0x..."
        var result = String(reader.result);
        resolve({ name: file.name, data: result.slice(result.indexOf(',') + 1) });
      };
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.readAsDataURL(file);
    });
  }

  window.Portal = {
    STATUS: STATUS,
    badge: badge,
    label: label,
    money: money,
    date: date,
    dateTime: dateTime,
    cell: cell,
    cellWith: cellWith,
    element: element,
    icon: icon,
    button: button,
    stars: stars,
    openModal: openModal,
    closeModal: closeModal,
    showFormError: showFormError,
    readFileAsBase64: readFileAsBase64
  };
})();
