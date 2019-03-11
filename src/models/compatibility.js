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
    if (request.protocol !== 'tcp') {
        return;
    }

    const isObject = require('../util/helpers').isObject;

    (request.stubs || []).forEach(stub => {
        (stub.responses || []).forEach(response => {
            const proxy = response.proxy;
            if (proxy && isObject(proxy.to) && proxy.to.host && proxy.to.port) {
                proxy.to = `tcp://${proxy.to.host}:${proxy.to.port}`;
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

/**
 * While the new injection interface takes a single config object, the old
 * interface took several parameters, starting with the request object.
 * To make the new interface backwards compatible, we have to add all the
 * request fields to the config object
 * @param {Object} config - the injection parameter
 */
function downcastInjectionConfig (config) {
    // Only possible to use older format for http/s and tcp protocols
    if (config.request.method || config.request.data) {
        Object.keys(config.request).forEach(key => {
            config[key] = config.request[key];
        });
    }
}

module.exports = {
    upcast,
    downcastInjectionConfig
};
