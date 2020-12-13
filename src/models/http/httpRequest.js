'use strict';

/**
 * Transforms a node http/s request to a simplified mountebank http/s request
 * that will be shown in the API
 * @module
 */

function transform (request) {
    const helpers = require('../../util/helpers'),
        url = require('url'),
        queryString = require('query-string'),
        parts = url.parse(request.url, true),
        headersHelper = require('./headersHelper');

    const headers = headersHelper.headersFor(request.rawHeaders);

    const transformed = {
        requestFrom: helpers.socketName(request.socket),
        method: request.method,
        path: parts.pathname,
        query: parts.query,
        headers,
        body: request.body,
        ip: request.socket.remoteAddress
    };

    const contentType = headersHelper.getHeader('Content-Type', headers);
    if (request.body && isUrlEncodedForm(contentType)) {
        transformed.form = queryString.parse(request.body);
    }

    return transformed;
}

function isUrlEncodedForm (contentType) {
    if (!contentType) {
        return false;
    }

    const index = contentType.indexOf(';');
    const type = index !== -1 ?
        contentType.substr(0, index).trim() :
        contentType.trim();

    return type === 'application/x-www-form-urlencoded';
}

/**
 * Creates the API-friendly http/s request
 * @param {Object} request - The raw http/s request
 * @returns {Object} - Promise resolving to the simplified request
 */
function createFrom (request) {
    const Q = require('q'),
        deferred = Q.defer();
    let chunks = [];
    request.on('data', chunk => { chunks.push(Buffer.from(chunk)); });
    request.on('end', () => {
        const headersHelper = require('./headersHelper');
        const headers = headersHelper.headersFor(request.rawHeaders);
        const contentEncoding = headersHelper.getHeader('Content-Encoding', headers);
        const zlib = require('zlib');
        let buffer = Buffer.concat(chunks);
        if (contentEncoding === 'gzip') {
            try {
                request.body = zlib.gunzipSync(buffer).toString();
            }
            catch (error) { /* do nothing */ }
        }
        else {
            request.body = buffer.toString();
        }
        deferred.resolve(transform(request));
    });
    return deferred.promise;
}

module.exports = { createFrom };
