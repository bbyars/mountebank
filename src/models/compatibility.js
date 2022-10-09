'use strict';

const helpers = require('../util/helpers');

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

function canUpcastBehaviors (response) {
    const isObject = helpers.isObject;

    return typeof response.behaviors === 'undefined'
        && typeof response.repeat === 'undefined'
        && isObject(response._behaviors);
}

function upcastResponseBehaviors (response) {
    const behaviors = [],
        add = (key, value) => {
            const obj = {};
            obj[key] = value;
            behaviors.push(obj);
        };

    // This was the old line of code that executed the behaviors, which defined the order:
    //     return combinators.compose(decorateFn, shellTransformFn, copyFn, lookupFn, waitFn, Q)(response);
    ['wait', 'lookup', 'copy', 'shellTransform', 'decorate'].forEach(key => {
        if (typeof response._behaviors[key] !== 'undefined') {
            if (Array.isArray(response._behaviors[key])) {
                response._behaviors[key].forEach(element => add(key, element));
            }
            else {
                add(key, response._behaviors[key]);
            }
        }
    });

    // The repeat behavior can't be stacked multiple times and sequence of execution doesn't matter,
    // so putting it in the array risks confusion and additional error checking. Pulling it outside
    // the array clearly indicates it only applies once to the entire response.
    if (typeof response._behaviors.repeat !== 'undefined') {
        response.repeat = response._behaviors.repeat;
    }

    response.behaviors = behaviors;
    delete response._behaviors;
}

/**
 * The original _behaviors took an object with undefined ordering
 * The new syntax expects an array, creating a behaviors pipeline
 * @param {Object} request - the request to upcast
 */
function upcastBehaviorsToArray (request) {
    (request.stubs || []).forEach(stub => {
        (stub.responses || [])
            .filter(canUpcastBehaviors)
            .forEach(upcastResponseBehaviors);
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

    const isObject = helpers.isObject;

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
    upcastBehaviorsToArray(request);
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
