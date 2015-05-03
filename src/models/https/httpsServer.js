'use strict';

var fs = require('fs'),
    https = require('https'),
    baseHttpServer = require('../http/baseHttpServer'),
    defaultKey = fs.readFileSync(__dirname + '/cert/mb-key.pem', 'utf8'),
    defaultCert = fs.readFileSync(__dirname + '/cert/mb-cert.pem', 'utf8');

function initialize (allowInjection, recordRequests) {
    var createServer = function (options) {
        // client certs will not reject the request.  It does set the request.client.authorized variable
        // to false for all self-signed certs; use rejectUnauthorized: true and a ca: field set to an array
        // containing the client cert to see request.client.authorized = true
        return https.createServer({
                key: options.key || defaultKey,
                cert: options.cert || defaultCert,
                requestCert: !!options.mutualAuth,
                rejectUnauthorized: false
            });
        };
    return baseHttpServer.setup('https', createServer).initialize(allowInjection, recordRequests);
}

module.exports = {
    initialize: initialize
};
