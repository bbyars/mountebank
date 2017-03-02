'use strict';

/**
 * Additional tcp-specific validations
 * @module
 */

function validateMode (request) {
    var errors = [],
        exceptions = require('../../util/errors');

    if (request.mode && ['text', 'binary'].indexOf(request.mode) < 0) {
        errors.push(exceptions.ValidationError("'mode' must be one of ['text', 'binary']"));
    }
    return errors;
}

module.exports = {
    /**
     * Creates the tcp validator, which wraps dry run validation with some protocol-specific validation
     * @param {boolean} allowInjection - The --allowInjection command line parameter
     * @returns {Object}
     */
    create: function (allowInjection) {
        return require('../dryRunValidator').create({
            StubRepository: require('../stubRepository'),
            testRequest: require('./tcpRequest').createTestRequest(),
            testProxyResponse: { data: '' },
            allowInjection: allowInjection,
            additionalValidation: validateMode
        });
    }
};
