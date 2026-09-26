/* ==========================================================================
   Equipify — Shared rental request timing helper (vanilla JS, no deps)

   A rental request moves through fixed windows:
     1. the renting party accepts or rejects it within 1 day,
     2. once accepted, the customer pays within 1 day,
     3. Equipify delivers (or the customer collects) the day before the start.
   A missed window cancels the request.

   "1 day" is not a rolling 24 hours: it runs to the end (23:59:59, local
   time) of the next calendar day. A request placed at 15:00 therefore has
   (24:00 - 15:00) + 24h = 33h to be answered. Payment counts the same way
   from the moment of acceptance.

   The whole chain has to fit before the rental starts, so the earliest start
   date is today + 4 days (response by end of day 1, payment by end of day 2,
   delivery on day 3, start on day 4). The same minimum applies to pickup.

     EquipifyRentalTiming.deadlineFrom(date, days)   Date at 23:59:59 on date + days
     EquipifyRentalTiming.earliestStartISO()         'YYYY-MM-DD', today + 4
     EquipifyRentalTiming.addDaysISO(iso, n)         'YYYY-MM-DD' shifted by n days
     EquipifyRentalTiming.dayBefore(iso)             delivery / pickup date
     EquipifyRentalTiming.daysBetween(startIso, endIso)
     EquipifyRentalTiming.formatRemaining(ms)        '1d 4h', '17h 42m', '38m'
     EquipifyRentalTiming.formatShortDate(isoOrDate) '27 Sep'
     EquipifyRentalTiming.formatDate(isoOrDate)      'Sun, 27 Sep 2026'
     EquipifyRentalTiming.formatDateTime(date)       'Sun, 27 Sep, 11:59 PM'
     EquipifyRentalTiming.resolveMockDeadlines(root) data-*-ago -> data-deadline
     EquipifyRentalTiming.startCountdowns(root, onExpire)

   Front-end timing is only a display aid: the backend decides the real
   deadlines when the rentals module exists.
   ========================================================================== */

(function () {
  'use strict';

  var RESPONSE_DAYS = 1;
  var PAYMENT_DAYS = 1;
  var MIN_LEAD_DAYS = 4;
  var URGENT_MS = 2 * 60 * 60 * 1000;
  var MINUTE_MS = 60 * 1000;

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function toISODate(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  // Parses 'YYYY-MM-DD' as a local calendar date (new Date('YYYY-MM-DD') is UTC).
  function parseISODate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    var date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return toISODate(date) === iso ? date : null;
  }

  function deadlineFrom(date, days) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 59, 0);
    return d;
  }

  function addDaysISO(iso, n) {
    var date = parseISODate(iso);
    if (!date) return '';
    date.setDate(date.getDate() + n);
    return toISODate(date);
  }

  function earliestStartISO() {
    return addDaysISO(toISODate(new Date()), MIN_LEAD_DAYS);
  }

  function dayBefore(iso) {
    return addDaysISO(iso, -1);
  }

  function daysBetween(startIso, endIso) {
    var start = parseISODate(startIso);
    var end = parseISODate(endIso);
    if (!start || !end) return 0;
    return Math.round((end - start) / (24 * 60 * 60 * 1000));
  }

  function formatRemaining(ms) {
    if (ms <= 0) return '0m';
    var totalMinutes = Math.ceil(ms / MINUTE_MS);
    var days = Math.floor(totalMinutes / 1440);
    var hours = Math.floor((totalMinutes % 1440) / 60);
    var minutes = totalMinutes % 60;
    if (days > 0) return days + 'd ' + hours + 'h';
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    return minutes + 'm';
  }

  // Spelled out rather than toLocaleDateString, whose en-GB output differs
  // between browsers ('Sept' vs 'Sep', with or without a comma).
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function toDate(value) {
    return typeof value === 'string' ? parseISODate(value) : value;
  }

  // '30 Sep'
  function formatShortDate(value) {
    var date = toDate(value);
    return date ? date.getDate() + ' ' + MONTHS[date.getMonth()] : '';
  }

  // 'Wed, 30 Sep 2026'
  function formatDate(value) {
    var date = toDate(value);
    return date ? WEEKDAYS[date.getDay()] + ', ' + formatShortDate(date) + ' ' + date.getFullYear() : '';
  }

  // 'Sun, 27 Sep, 11:59 PM'
  function formatDateTime(date) {
    var hours = date.getHours();
    var time = (hours % 12 || 12) + ':' + pad(date.getMinutes()) + (hours < 12 ? ' AM' : ' PM');
    return WEEKDAYS[date.getDay()] + ', ' + formatShortDate(date) + ', ' + time;
  }

  /**
   * Mock rows describe when a request was placed or accepted, relative to
   * now, so the demo countdowns always look live:
   *   data-placed-ago="<minutes>"    -> response deadline (end of next day)
   *   data-accepted-ago="<minutes>"  -> payment deadline  (end of next day)
   *   data-deadline-in="<minutes>"   -> explicit override, handy for testing
   * Each becomes a data-deadline ISO timestamp on the same element.
   */
  function resolveMockDeadlines(root) {
    var now = Date.now();
    (root || document).querySelectorAll('[data-placed-ago], [data-accepted-ago], [data-deadline-in]').forEach(function (el) {
      var deadline;
      if (el.hasAttribute('data-deadline-in')) {
        deadline = new Date(now + Number(el.getAttribute('data-deadline-in')) * MINUTE_MS);
      } else if (el.hasAttribute('data-accepted-ago')) {
        deadline = deadlineFrom(new Date(now - Number(el.getAttribute('data-accepted-ago')) * MINUTE_MS), PAYMENT_DAYS);
      } else {
        deadline = deadlineFrom(new Date(now - Number(el.getAttribute('data-placed-ago')) * MINUTE_MS), RESPONSE_DAYS);
      }
      el.setAttribute('data-deadline', deadline.toISOString());
    });
  }

  /**
   * Keeps every [data-deadline] countdown under root up to date. Inside each
   * countdown element, [data-countdown-remaining] gets '17h 42m' and
   * [data-countdown-at] gets the absolute deadline. The element gains
   * is-urgent under 2h and is-expired at zero, when onExpire(el) runs once.
   * Returns a refresh() function to call after adding or changing deadlines.
   */
  function startCountdowns(root, onExpire) {
    var scope = root || document;

    function tick() {
      var now = Date.now();
      scope.querySelectorAll('[data-deadline]').forEach(function (el) {
        if (el.classList.contains('is-expired')) return;
        var deadline = new Date(el.getAttribute('data-deadline'));
        var left = deadline.getTime() - now;

        var remaining = el.querySelector('[data-countdown-remaining]');
        var at = el.querySelector('[data-countdown-at]');
        if (remaining) remaining.textContent = formatRemaining(left);
        if (at) at.textContent = formatDateTime(deadline);

        el.classList.toggle('is-urgent', left > 0 && left < URGENT_MS);
        if (left <= 0) {
          el.classList.add('is-expired');
          el.classList.remove('is-urgent');
          if (onExpire) onExpire(el);
        }
      });
    }

    tick();
    // Tick at the next minute boundary so '38m' flips when the clock does.
    window.setTimeout(function () {
      tick();
      window.setInterval(tick, MINUTE_MS);
    }, MINUTE_MS - (Date.now() % MINUTE_MS));

    return tick;
  }

  window.EquipifyRentalTiming = {
    RESPONSE_DAYS: RESPONSE_DAYS,
    PAYMENT_DAYS: PAYMENT_DAYS,
    MIN_LEAD_DAYS: MIN_LEAD_DAYS,
    toISODate: toISODate,
    parseISODate: parseISODate,
    deadlineFrom: deadlineFrom,
    addDaysISO: addDaysISO,
    earliestStartISO: earliestStartISO,
    dayBefore: dayBefore,
    daysBetween: daysBetween,
    formatRemaining: formatRemaining,
    formatShortDate: formatShortDate,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    resolveMockDeadlines: resolveMockDeadlines,
    startCountdowns: startCountdowns
  };
})();
