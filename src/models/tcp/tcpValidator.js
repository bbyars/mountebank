'use strict';

var DryRunValidator = require('../dryRunValidator'),
    StubRepository = require('../stubRepository'),
    TcpRequest = require('./tcpRequest'),
    exceptions = require('../../util/errors');

function validateMode (request) {
    var errors = [];
    if (request.mode && ['text', 'binary'].indexOf(request.mode) < 0) {
        errors.push(exceptions.ValidationError("'mode' must be one of ['text', 'binary']"));
    }
    return errors;
}

module.exports = {
    create: function (allowInjection) {
        return DryRunValidator.create({
            StubRepository: StubRepository,
            testRequest: TcpRequest.createTestRequest(),
            testProxyResponse: { data: '' },
            allowInjection: allowInjection,
            additionalValidation: validateMode
        });
    }
};
