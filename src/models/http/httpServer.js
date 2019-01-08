'use strict';

/**
 * Represents an http imposter
 * @module
 */

function createBaseServer () {
    return {
        metadata: {},
        createNodeServer: require('http').createServer
    };
}

module.exports = require('./baseHttpServer')(createBaseServer);
