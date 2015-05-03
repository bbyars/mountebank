'use strict';

var createServer = function () { return require('http').createServer(); },
    baseHttpServer = require('./baseHttpServer');

module.exports = {
    initialize: baseHttpServer.setup('http', createServer).initialize
};
