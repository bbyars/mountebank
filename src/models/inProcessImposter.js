'use strict';

function create (Protocol, creationRequest, logger, getResponseFor, recordMatches) {
    return Protocol.create(creationRequest, logger, getResponseFor).then(server => {
        const resolver = require('./responseResolver').create(server.proxy),
            stubs = require('./stubRepository').create(resolver, recordMatches, server.encoding || 'utf8'),
            Q = require('q');

        return Q({
            port: server.port,
            metadata: server.metadata,
            resolver: resolver,
            stubs: stubs,
            close: server.close
        });
    });
}

module.exports = { create };
