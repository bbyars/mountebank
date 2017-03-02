'use strict';

/**
 * Transforms a raw tcp request into the API-friendly representation of one
 * @module
 */

/**
 * Creates the request used during dry run validation
 * @returns {Object}
 */
function createTestRequest () {
    return {
        requestFrom: '',
        data: 'test'
    };
}

/**
 * Transforms the raw tcp request into a mountebank tcp request
 * @param {Object} request - The raw tcp request
 * @returns {Object} - A promise resolving to the mountebank tcp request
 */
function createFrom (request) {
    var Q = require('q'),
        helpers = require('../../util/helpers');

    return Q({
        requestFrom: helpers.socketName(request.socket),
        data: request.data
    });
}

module.exports = {
    createTestRequest: createTestRequest,
    createFrom: createFrom
};
