'use strict';

/**
 * Represents an https imposter
 * @module
 */

/**
 * Initializes the https protocol
 * @param {boolean} allowInjection - The --allowInjection command line parameter
 * @param {boolean} recordRequests - The --mock command line parameter
 * @param {boolean} debug - The --debug command line parameter
 * @returns {Object} - The protocol implementation
 */
function initialize (allowInjection, recordRequests, debug) {
    var createBaseServer = function (options) {
        var path = require('path'),
            fs = require('fs'),
            metadata = {
                key: options.key || fs.readFileSync(path.join(__dirname, '/cert/mb-key.pem'), 'utf8'),
                cert: options.cert || fs.readFileSync(path.join(__dirname, '/cert/mb-cert.pem'), 'utf8'),
                mutualAuth: !!options.mutualAuth
            },
            createNodeServer = function () {
                // client certs will not reject the request.  It does set the request.client.authorized variable
                // to false for all self-signed certs; use rejectUnauthorized: true and a ca: field set to an array
                // containing the client cert to see request.client.authorized = true
                return require('https').createServer({
                    key: metadata.key,
                    cert: metadata.cert,
                    requestCert: metadata.mutualAuth,
                    rejectUnauthorized: false
                });
            };

        return {
            metadata: function () { return metadata; },
            createNodeServer: createNodeServer
        };
    };
    return require('../http/baseHttpServer').setup('https', createBaseServer).initialize(allowInjection, recordRequests, debug);
}

module.exports = {
    initialize: initialize
};
