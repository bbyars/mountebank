'use strict';

/**
 * mountebank aims to evolve without requiring users to have to worry about versioning,
 * so breaking changes to the API are A Big Deal. This module exists to support transforming
 * older versions of the API to a newer format, so that most of the code can assume the
 * new format, but users who still use the old format don't need to migrate.
 * @module
 */

function upcastShellTransformToArray (request) {
    (request.stubs || []).forEach(stub => {
        (stub.responses || []).forEach(function (response) {
            if (response._behaviors && response._behaviors.shellTransform &&
                typeof response._behaviors.shellTransform === 'string') {
                response._behaviors.shellTransform = [response._behaviors.shellTransform];
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
}

module.exports = {
    upcast: upcast
};
