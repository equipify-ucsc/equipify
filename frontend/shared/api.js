/* ==========================================================================
   Equipify — shared API helper
   Pages call the PHP JSON API through EquipifyApi.request() instead of using
   fetch() directly. Every endpoint answers {success, data} or
   {success:false, error, fields?}; this resolves (never rejects) with a
   normalised result so callers can branch on result.ok / result.status.

   The base URL is relative to the page: every page lives at
   frontend/<Role>/<Page>/, so the API at backend/api is ../../../backend/api.
   Serve over HTTP from XAMPP (fetch and the session cookie don't work on file://).
   ========================================================================== */

(function () {
  'use strict';

  var BASE = '../../../backend/api';
  var sessionVersion = 0, identity = null, sessionListeners = [];
  var sessionChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('equipify-session') : null;
  function invalidateSession(broadcast) {
    sessionVersion++; identity = null;
    sessionListeners.slice().forEach(function (listener) { listener(); });
    if (broadcast) {
      if (sessionChannel) sessionChannel.postMessage('changed');
      // No user data is stored; storage events cover browsers without BroadcastChannel.
      try { localStorage.setItem('equipify-session-change', Date.now() + ':' + Math.random()); } catch (_) {}
    }
  }
  if (sessionChannel) sessionChannel.onmessage = function () { invalidateSession(false); };
  window.addEventListener('storage', function (event) {
    if (!sessionChannel && event.key === 'equipify-session-change') invalidateSession(false);
  });
  window.addEventListener('pagehide', function () { invalidateSession(false); });
  function staleResult() {
    return {ok: false, status: 401, data: null, error: 'Your session changed. Please reload or sign in again.', fields: {}};
  }

  /**
   * @param {string} method  GET, POST, ...
   * @param {string} path    e.g. '/auth/login'
   * @param {Object} [body]  sent as JSON
   * @returns {Promise<{ok:boolean,status:number,data:*,error:string,fields:Object}>}
   */
  function request(method, path, body) {
    if (method !== 'GET' && /^\/auth\/(login|logout)(?:\?|$)/.test(path)) invalidateSession(true);
    var version = sessionVersion;
    var options = {
      method: method,
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    return fetch(BASE + path, options).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (json) {
        if (version !== sessionVersion) return staleResult();
        var responseIdentity = response.headers.get('X-Equipify-Identity');
        if (responseIdentity) {
          if (identity !== null && identity !== responseIdentity) {
            invalidateSession(true);
            return staleResult();
          }
          identity = responseIdentity;
        }
        var ok = response.ok && json !== null && json.success === true;
        return {
          ok: ok,
          status: response.status,
          data: ok ? json.data : null,
          error: ok ? '' : (json && json.error) || 'Something went wrong. Please try again.',
          fields: (json && json.fields) || {}
        };
      });
    }).catch(function () {
      if (version !== sessionVersion) return staleResult();
      return {
        ok: false,
        status: 0,
        data: null,
        error: 'Could not reach the server. Check your connection and try again.',
        fields: {}
      };
    });
  }

  /**
   * Appends a query string to a path, skipping empty values so a cleared search
   * box or an "All statuses" filter simply isn't sent.
   *
   * @param {string} path   e.g. '/freelancer/jobs'
   * @param {Object} params e.g. { q: 'crane', status: '', page: 2 }
   * @returns {string}      e.g. '/freelancer/jobs?q=crane&page=2'
   */
  function withQuery(path, params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return parts.length ? path + '?' + parts.join('&') : path;
  }

  /**
   * The browser-usable URL for an endpoint, for the few places that are not a
   * fetch — an <img src> pointing at an endpoint that streams a stored file.
   *
   * @param {string} path e.g. '/freelancer/portfolio/7/image'
   */
  function url(path) {
    return BASE + path;
  }

  window.EquipifyApi = {
    sessionVersion: function () { return sessionVersion; },
    onSessionChange: function (listener) {
      sessionListeners.push(listener);
      return function () { sessionListeners = sessionListeners.filter(function (item) { return item !== listener; }); };
    },
    invalidateSession: invalidateSession,
    request: request,
    withQuery: withQuery,
    url: url,
    get: function (path) { return request('GET', path); },
    query: function (path, params) { return request('GET', withQuery(path, params)); },
    post: function (path, body) { return request('POST', path, body === undefined ? {} : body); },
    put: function (path, body) { return request('PUT', path, body === undefined ? {} : body); },
    // An empty object rather than no body: the API rejects a state-changing
    // request that isn't application/json, and the header only goes out when
    // there is something to send.
    del: function (path, body) { return request('DELETE', path, body === undefined ? {} : body); }
  };
})();
