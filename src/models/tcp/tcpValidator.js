'use strict';

const exceptions = require('../../util/errors.js');

/**
 * Additional tcp-specific validations
 * @module
 */

function validate (request) {
    const errors = [];

    if (request.mode && ['text', 'binary'].indexOf(request.mode) < 0) {
        errors.push(exceptions.ValidationError("'mode' must be one of ['text', 'binary']"));
    }
    return errors;
}

module.exports = { validate };
