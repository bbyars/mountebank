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

function patchRawHeaders () {
    var requestPrototype = http.IncomingMessage.prototype,
        _addHeaderLine = requestPrototype._addHeaderLine;

    // Patch ServerRequest to save unmodified copy of headers so we get original case
    // (see https://github.com/bbyars/mountebank/issues/75)
    // This is only needed for node 0.10 compatibility as we get rawHeaders with 0.12+
    // Adapted rom http://grokbase.com/t/gg/nodejs/125ynyxa6c/need-raw-http-headers
    requestPrototype._addHeaderLine = function (field, value) {
        this.rawHeaders = this.rawHeaders || [];
        this.rawHeaders.push(field);
        this.rawHeaders.push(value);
        _addHeaderLine.call(this, field, value);
    };
}

module.exports = {
    /**
     * Initializes the http imposter protocol
     * @param {boolean} allowInjection - The --allowInjection command line parameter
     * @param {boolean} mock - The --mock command line parameter
     * @param {boolean} debug - The --debug command line parameter
     * @returns {Object} - The protocol implementation
     */
    initialize: function (allowInjection, mock, debug) {
        if (process.version.indexOf('v0.10') === 0) {
            patchRawHeaders();
        }
        return baseHttpServer.setup('http', createBaseServer).initialize(allowInjection, mock, debug);
    }
};
