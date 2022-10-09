'use strict';

const path = require('path'),
    fs = require('fs'),
    https = require('https'),
    baseHttpServer = require('../http/baseHttpServer.js');

/**
 * Represents an https imposter
 * @module
 */

function createBaseServer (options) {
    const metadata = {
            key: options.key || fs.readFileSync(path.join(__dirname, '/cert/mb-key.pem'), 'utf8'),
            cert: options.cert || fs.readFileSync(path.join(__dirname, '/cert/mb-cert.pem'), 'utf8'),
            mutualAuth: Boolean(options.mutualAuth),
            rejectUnauthorized: options.rejectUnauthorized || false,
            ca: options.ca || null
        },
        // client certs will not reject the request.  It does set the request.client.authorized variable
        // to false for all self-signed certs; use rejectUnauthorized: true and a ca: field set to an array
        // containing the client cert to see request.client.authorized = true
        config = {
            key: metadata.key,
            cert: metadata.cert,
            mutualAuth: metadata.mutualAuth,
            rejectUnauthorized: metadata.rejectUnauthorized,
            ca: metadata.ca,
            requestCert: metadata.mutualAuth && metadata.rejectUnauthorized
        },
        createNodeServer = () => https.createServer(config);

    if (options.ciphers) {
        metadata.ciphers = options.ciphers.toUpperCase();
        config.ciphers = options.ciphers.toUpperCase();
    }

    return { metadata, createNodeServer };
}

module.exports = baseHttpServer(createBaseServer);
