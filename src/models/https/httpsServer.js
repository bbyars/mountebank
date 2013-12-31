'use strict';

var fs = require('fs'),
    cert = {
        key: fs.readFileSync(__dirname + '/cert/mb-key.pem'),
        cert: fs.readFileSync(__dirname + '/cert/mb-cert.pem')
    },
    https = require('https'),
    baseHttpServer = require('../http/baseHttpServer');

function createServer () {
    return https.createServer(cert);
}

module.exports = {
    initialize: baseHttpServer.setup('https', createServer).initialize
};
