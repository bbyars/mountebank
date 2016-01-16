'use strict';

/**
 * Represents an http imposter
 * @module
 */

var baseHttpServer = require('./baseHttpServer'),
    combinators = require('../../util/combinators'),
    http = require('http'),
    createBaseServer = function () {
        return {
            metadata: combinators.constant({}),
            createNodeServer: http.createServer
        };
    };

module.exports = {
    /**
     * Initializes the http imposter protocol
     * @param {boolean} allowInjection - The --allowInjection command line parameter
     * @param {boolean} mock - The --mock command line parameter
     * @param {boolean} debug - The --debug command line parameter
     * @returns {Object} - The protocol implementation
     */
    initialize: function (allowInjection, mock, debug) {
        return baseHttpServer.setup('http', createBaseServer).initialize(allowInjection, mock, debug);
    }
};
