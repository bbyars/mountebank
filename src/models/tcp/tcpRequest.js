'use strict';

const helpers = require('../../util/helpers.js');

/**
 * Transforms a raw tcp request into the API-friendly representation of one
 * @module
 */

/**
 * Transforms the raw tcp request into a mountebank tcp request
 * @param {Object} request - The raw tcp request
 * @returns {Object} - A promise resolving to the mountebank tcp request
 */
function createFrom (request) {
    return Promise.resolve({
        requestFrom: helpers.socketName(request.socket),
        ip: request.socket.remoteAddress,
        data: request.data
    });
}

module.exports = { createFrom };
