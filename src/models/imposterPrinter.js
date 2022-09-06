'use strict';

const helpers = require('../util/helpers.js');

function create (header, server, loadRequests) {
    const baseURL = `/imposters/${server.port}`;

    function createHeader (numberOfRequests, options) {
        const result = {
            protocol: header.protocol,
            port: server.port
        };

        if (header.name) {
            result.name = header.name;
        }
        if (header.defaultResponse) {
            result.defaultResponse = header.defaultResponse;
        }
        if (!options.replayable) {
            result.numberOfRequests = numberOfRequests;
        }
        if (!options.list) {
            result.recordRequests = Boolean(header.recordRequests);

            Object.keys(server.metadata).forEach(key => {
                result[key] = server.metadata[key];
            });
        }
        if (header.endOfRequestResolver) {
            result.endOfRequestResolver = header.endOfRequestResolver;
        }

        return result;
    }

    async function addStubsTo (imposter, options) {
        const newOptions = {};
        if (!options.replayable) {
            newOptions.debug = true;
        }

        imposter.stubs = await server.stubs.toJSON(newOptions);
        return imposter;
    }

    function removeNonEssentialInformationFrom (imposter) {
        imposter.stubs.forEach(stub => {
            stub.responses.forEach(response => {
                if (helpers.defined(response.is)) {
                    delete response.is._proxyResponseTime;
                }
            });
        });
    }

    async function addRequestsTo (imposter) {
        imposter.requests = await loadRequests();
        return imposter;
    }

    function removeProxiesFrom (imposter) {
        imposter.stubs.forEach(stub => {
            // eslint-disable-next-line no-prototype-builtins
            stub.responses = stub.responses.filter(response => !response.hasOwnProperty('proxy'));
        });
        imposter.stubs = imposter.stubs.filter(stub => stub.responses.length > 0);
    }

    function addLinksTo (imposter) {
        imposter._links = {
            self: { href: baseURL },
            stubs: { href: `${baseURL}/stubs` }
        };

        if (imposter.stubs) {
            for (let i = 0; i < imposter.stubs.length; i += 1) {
                imposter.stubs[i]._links = { self: { href: `${baseURL}/stubs/${i}` } };
            }
        }
    }

    async function toJSON (numberOfRequests, options = {}) {
        // I consider the order of fields represented important.  They won't matter for parsing,
        // but it makes a nicer user experience for developers viewing the JSON to keep the most
        // relevant information at the top. Some of the order of operations in this file represents
        // that (e.g. keeping the _links at the end), and is tested with some documentation tests.
        const result = createHeader(numberOfRequests, options);

        options = options || {};

        if (options.list) {
            addLinksTo(result);
            return result;
        }

        if (!options.replayable) {
            await addRequestsTo(result);
        }

        await addStubsTo(result, options);

        if (options.replayable) {
            removeNonEssentialInformationFrom(result);
        }
        else {
            addLinksTo(result);
        }

        if (options.removeProxies) {
            removeProxiesFrom(result);
        }

        return result;
    }

    return { toJSON };
}

module.exports = { create };
