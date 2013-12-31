'use strict';

var createServer = require('http').createServer,
    baseHttpServer = require('./baseHttpServer');

module.exports = {
    initialize: baseHttpServer.setup('http', createServer).initialize
};
