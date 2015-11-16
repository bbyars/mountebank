'use strict';

/**
 * Transforms a node http/s request to a simplified mountebank http/s request
 * that will be shown in the API
 * @module
 */

var Q = require('q'),
    url = require('url'),
    helpers = require('../../util/helpers');

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
        body: ''
    };
}

function headersFor (rawHeaders) {
    var result = {};
    for (var i = 0; i < rawHeaders.length; i += 2) {
        result[rawHeaders[i]] = rawHeaders[i + 1];
    }
    return result;
}

function transform (request) {
    var parts = url.parse(request.url, true);
    return {
        requestFrom: helpers.socketName(request.socket),
        method: request.method,
        path: parts.pathname,
        query: parts.query,
        headers: headersFor(request.rawHeaders),
        body: request.body
    };
}

/**
 * Creates the API-friendly http/s request
 * @param {Object} container - An object containing the raw http/s request
 * @returns {Object} - Promise resolving to the simplified request
 */
function createFrom (container) {
    var deferred = Q.defer(),
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
