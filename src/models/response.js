'use strict';

function create (responseConfig, stub) {
    const helpers = require('../util/helpers'),
        cloned = helpers.clone(responseConfig);

    cloned.recordMatch = (request, response) => {
        const clonedResponse = helpers.clone(response),
            match = {
                timestamp: new Date().toJSON(),
                request,
                response: clonedResponse
            };
        if (helpers.defined(clonedResponse._proxyResponseTime)) { // eslint-disable-line no-underscore-dangle
            delete clonedResponse._proxyResponseTime; // eslint-disable-line no-underscore-dangle
        }

        stub.matches = stub.matches || [];
        stub.matches.push(match);
        cloned.recordMatch = () => {}; // Only record once
    };

    cloned.setMetadata = (responseType, metadata) => {
        Object.keys(metadata).forEach(key => {
            responseConfig[responseType][key] = metadata[key];
            cloned[responseType][key] = metadata[key];
        });
    };
    return cloned;
}

module.exports = { create };
