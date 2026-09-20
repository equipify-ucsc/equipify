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

  /**
   * @param {string} method  GET, POST, ...
   * @param {string} path    e.g. '/auth/login'
   * @param {Object} [body]  sent as JSON
   * @returns {Promise<{ok:boolean,status:number,data:*,error:string,fields:Object}>}
   */
  function request(method, path, body) {
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
      return {
        ok: false,
        status: 0,
        data: null,
        error: 'Could not reach the server. Check your connection and try again.',
        fields: {}
      };
    });
  }

  window.EquipifyApi = {
    request: request,
    get: function (path) { return request('GET', path); },
    post: function (path, body) { return request('POST', path, body === undefined ? {} : body); }
  };
})();
