'use strict';

var baseHttpServer = require('./baseHttpServer'),
    combinators = require('../../util/combinators'),
    http = require('http'),
    createBaseServer = function () {
        return {
            metadata: combinators.constant({}),
            createNodeServer: http.createServer
        };
    };

module.exports = {
    initialize: baseHttpServer.setup('http', createBaseServer).initialize
};
