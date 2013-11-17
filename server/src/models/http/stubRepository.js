'use strict';

var Validator = require('../../util/validator');

function create () {
    var stubs = {};

    function createResponse (stub) {
        var response = {
            statusCode: stub.statusCode || 200,
            headers: stub.headers || {},
            body: stub.body || ''
        };

        // We don't want to use keepalive connections, because a test case
        // may shutdown the stub, which prevents new connections for
        // the port, but that won't prevent the system under test
        // from reusing an existing TCP connection after the stub
        // has shutdown, causing difficult to track down bugs when
        // multiple tests are run.
        response.headers.connection = 'close';
        return response;
    }

    function hasStub (request) {
        return stubs[request.path] && stubs[request.path].length > 0;
    }

    function isValidStubRequest (request) {
        return stubRequestErrorsFor(request).length === 0;
    }

    function stubRequestErrorsFor (request) {
        var validator = Validator.create({
            requiredFields: { path: request.path },
            requireNonEmptyArrays: { responses: request.responses }
        });
        return validator.errors();
    }

    function addStub (request) {
        stubs[request.path] = request.responses;
    }

    function resolve (request) {
        var stub = {};
        if (hasStub(request)) {
            stub = stubs[request.path].shift();
            stubs[request.path].push(stub);
        }
        return createResponse(stub);
    }

    return {
        isValidStubRequest: isValidStubRequest,
        stubRequestErrorsFor: stubRequestErrorsFor,
        addStub: addStub,
        resolve: resolve
    };
}

module.exports = {
    create: create
};
