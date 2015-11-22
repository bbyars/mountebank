'use strict';

/**
 * Represents an https imposter
 * @module
 */

var fs = require('fs'),
    path = require('path'),
    https = require('https'),
    baseHttpServer = require('../http/baseHttpServer'),
    defaultKey = fs.readFileSync(path.join(__dirname, '/cert/mb-key.pem'), 'utf8'),
    defaultCert = fs.readFileSync(path.join(__dirname, '/cert/mb-cert.pem'), 'utf8');

/**
 * Initializes the https protocol
 * @param {boolean} allowInjection - The --allowInjection command line parameter
 * @param {boolean} recordRequests - The --mock command line parameter
 * @param {boolean} debug - The --debug command line parameter
 * @returns {Object} - The protocol implementation
 */
function initialize (allowInjection, recordRequests, debug) {
    var createBaseServer = function (options) {
        var metadata = {
                key: options.key || defaultKey,
                cert: options.cert || defaultCert,
                mutualAuth: !!options.mutualAuth
            },
            createNodeServer = function () {
                // client certs will not reject the request.  It does set the request.client.authorized variable
                // to false for all self-signed certs; use rejectUnauthorized: true and a ca: field set to an array
                // containing the client cert to see request.client.authorized = true
                return https.createServer({
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
    return baseHttpServer.setup('https', createBaseServer).initialize(allowInjection, recordRequests, debug);
}

module.exports = {
    initialize: initialize
};
