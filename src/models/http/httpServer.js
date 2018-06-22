'use strict';

/**
 * Represents an http imposter
 * @module
 */

function createBaseServer () {
    var combinators = require('../../util/combinators');

    return {
        metadata: combinators.constant({}),
        createNodeServer: require('http').createServer
    };
}

module.exports = {
    /**
     * Initializes the http imposter protocol
     * @param {object} logger - the base logger
     * @param {boolean} allowInjection - The --allowInjection command line parameter
     * @param {boolean} mock - The --mock command line parameter
     * @param {boolean} debug - The --debug command line parameter
     * @returns {Object} - The protocol implementation
     */
    initialize: function (logger, allowInjection, mock, debug) {
        return require('./baseHttpServer').setup('http', createBaseServer).initialize(logger, allowInjection, mock, debug);
    }
};
