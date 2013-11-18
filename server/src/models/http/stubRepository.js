'use strict';

var Validator = require('../../util/validator');

function create () {
    var stubs = [];

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

    function pathMatches (request, predicates) {
        return (!predicates || !predicates.path || !predicates.path.is || request.path === predicates.path.is);
    }

    function methodMatches (request, predicates) {
        return (!predicates || !predicates.method || !predicates.method.is || request.method === predicates.method.is);
    }

    function findFirstMatch (request) {
        if (stubs.length === 0) {
            return undefined;
        }
        var matches = stubs.filter(function (stub) {
            return pathMatches(request, stub.predicates) && methodMatches(request, stub.predicates);
        });
        return (matches.length === 0) ? undefined : matches[0];
    }

    function isValidStubRequest (request) {
        return stubRequestErrorsFor(request).length === 0;
    }

    function stubRequestErrorsFor (request) {
        var validator = Validator.create({
            requireNonEmptyArrays: { responses: request.responses }
        });
        return validator.errors();
    }

    function addStub (stub) {
        stubs.push(stub);
    }

    function resolve (request) {
        var stubResponse = {},
            stub = findFirstMatch(request);

        if (stub) {
            stubResponse = stub.responses.shift();
            stub.responses.push(stubResponse);
        }
        return createResponse(stubResponse);
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
