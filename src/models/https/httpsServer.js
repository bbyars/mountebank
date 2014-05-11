'use strict';

var fs = require('fs'),
    https = require('https'),
    baseHttpServer = require('../http/baseHttpServer');

function initialize (allowInjection, recordRequests, keyfile, certfile) {
    var cert = {
            key: fs.readFileSync(keyfile || __dirname + '/cert/mb-key.pem'),
            cert: fs.readFileSync(certfile || __dirname + '/cert/mb-cert.pem')
        },
        createServer = function () {
            return https.createServer(cert);
        };
    return baseHttpServer.setup('https', createServer).initialize(allowInjection, recordRequests);
}

module.exports = {
    initialize: initialize
};
