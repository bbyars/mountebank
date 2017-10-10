'use strict';

/**
 * Transforms a node http/s request to a simplified mountebank http/s request
 * that will be shown in the API
 * @module
 */

/**
 * Returns the request that will be used during dry run validation
 * @returns {Object}
 */
function createTestRequest () {
    return {
        requestFrom: '',
        method: 'GET',
        path: '/',
        query: {},
        headers: {},
        form: {},
        body: ''
    };
}

function transform (request) {
    var helpers = require('../../util/helpers'),
        url = require('url'),
        queryString = require('query-string'),
        parts = url.parse(request.url, true),
        headersHelper = require('./headersHelper');

    var headers = headersHelper.headersFor(request.rawHeaders)

    var form = {};
    if (request.body && headers['Content-Type'] == "application/x-www-form-urlencoded") {
        form = queryString.parse(request.body);
    }

    return {
        requestFrom: helpers.socketName(request.socket),
        method: request.method,
        path: parts.pathname,
        query: parts.query,
        headers: headers,
        body: request.body,
        form: form
    };
}

/**
 * Creates the API-friendly http/s request
 * @param {Object} container - An object containing the raw http/s request
 * @returns {Object} - Promise resolving to the simplified request
 */
function createFrom (container) {
    var Q = require('q'),
        deferred = Q.defer(),
        request = container.request;
    request.body = '';
    request.setEncoding('utf8');
    request.on('data', function (chunk) { request.body += chunk; });
    request.on('end', function () { deferred.resolve(transform(request)); });
    return deferred.promise;
}

module.exports = {
    createTestRequest: createTestRequest,
    createFrom: createFrom
};
