'use strict';

const http = require('http'),
    baseHttpServer = require('./baseHttpServer.js');

/**
 * Represents an http imposter
 * @module
 */

function createBaseServer () {
    return {
        metadata: {},
        createNodeServer: http.createServer
    };
}

module.exports = baseHttpServer(createBaseServer);
