'use strict';

const queryString = require('querystring'),
    zlib = require('zlib'),
    helpers = require('../../util/helpers.js'),
    headersMapModule = require('./headersMap.js');


/**
 * Transforms a node http/s request to a simplified mountebank http/s request
 * that will be shown in the API
 * @module
 */

function transform (request) {
    const url = new URL(request.url, 'http://localhost'),
        search = url.search === '' ? '' : url.search.substr(1),
        headersMap = headersMapModule.ofRaw(request.rawHeaders),
        transformed = {
            requestFrom: helpers.socketName(request.socket),
            method: request.method,
            path: url.pathname,
            query: queryString.parse(search),
            headers: headersMap.all(),
            body: request.body,
            ip: request.socket.remoteAddress
        },
        contentType = headersMap.get('Content-Type');

    if (request.body && isUrlEncodedForm(contentType)) {
        transformed.form = queryString.parse(request.body);
    }

    return transformed;
}

function isUrlEncodedForm (contentType) {
    if (!contentType) {
        return false;
    }

    const index = contentType.indexOf(';'),
        type = index !== -1 ? contentType.substr(0, index).trim() : contentType.trim();

    return type === 'application/x-www-form-urlencoded';
}

/**
 * Creates the API-friendly http/s request
 * @param {Object} request - The raw http/s request
 * @returns {Object} - Promise resolving to the simplified request
 */
function createFrom (request) {
    return new Promise(resolve => {
        const chunks = [];
        request.on('data', chunk => { chunks.push(Buffer.from(chunk)); });
        request.on('end', () => {
            const headersMap = headersMapModule.ofRaw(request.rawHeaders),
                contentEncoding = headersMap.get('Content-Encoding'),
                buffer = Buffer.concat(chunks);

            if (contentEncoding === 'gzip') {
                try {
                    request.body = zlib.gunzipSync(buffer).toString();
                }
                catch (error) { /* do nothing */ }
            }
            else if (contentEncoding === 'br') {
                try {
                    request.body = zlib.brotliDecompressSync(buffer).toString();
                }
                catch (error) { /* do nothing */ }
            }
            else {
                request.body = buffer.toString();
            }
            resolve(transform(request));
        });
    });
}

module.exports = { createFrom };
