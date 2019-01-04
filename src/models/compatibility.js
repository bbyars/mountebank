'use strict';

/**
 * mountebank aims to evolve without requiring users to have to worry about versioning,
 * so breaking changes to the API are A Big Deal. This module exists to support transforming
 * older versions of the API to a newer format, so that most of the code can assume the
 * new format, but users who still use the old format don't need to migrate.
 * @module
 */

/**
 * The original shellTransform only accepted one command
 * The new syntax expects an array, creating a shell pipeline
 * @param {Object} request - the request to upcast
 */
function upcastShellTransformToArray (request) {
    (request.stubs || []).forEach(stub => {
        (stub.responses || []).forEach(response => {
            if (response._behaviors && response._behaviors.shellTransform &&
                typeof response._behaviors.shellTransform === 'string') {
                response._behaviors.shellTransform = [response._behaviors.shellTransform];
            }
        });
    });
}

/**
 * The original tcp proxy.to was an object with a host and port field
 * The new syntax uses a tcp:// url for symmetry with http/s
 * @param {Object} request - the request to upcast
 */
function upcastTcpProxyDestinationToUrl (request) {
    if (request.protocol !== 'tcp' && request.protocol !== 'foo') {
        return;
    }

    (request.stubs || []).forEach(stub => {
        (stub.responses || []).forEach(response => {
            const proxy = response.proxy;
            if (proxy && typeof proxy.to === 'object' && proxy.to.host && proxy.to.port) {
                proxy.to = `tcp://${proxy.to.host}:${proxy.to.port}`;
                console.log('UPCASTING PROXY: ' + proxy.to);
            }
        });
    });
}

/**
 * Upcast the request to the current version
 * @param {Object} request - the request to upcast
 */
function upcast (request) {
    upcastShellTransformToArray(request);
    upcastTcpProxyDestinationToUrl(request);
}

module.exports = {
    upcast: upcast
};
