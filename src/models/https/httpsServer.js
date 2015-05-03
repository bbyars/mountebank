'use strict';

var fs = require('fs'),
    https = require('https'),
    baseHttpServer = require('../http/baseHttpServer');

function initialize (allowInjection, recordRequests, keyfile, certfile) {
    var createServer = function (options) {
        // client certs will not reject the request.  It does set the request.client.authorized variable
        // to false for all self-signed certs; use rejectUnauthorized: true and a ca: field set to an array
        // containing the client cert to see request.client.authorized = true
        return https.createServer({
                key: fs.readFileSync(keyfile || __dirname + '/cert/mb-key.pem'),
                cert: fs.readFileSync(certfile || __dirname + '/cert/mb-cert.pem'),
                requestCert: !!options.mutualAuth,
                rejectUnauthorized: false
            });
        };
    return baseHttpServer.setup('https', createServer).initialize(allowInjection, recordRequests);
}

module.exports = {
    initialize: initialize
};
