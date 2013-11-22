'use strict';

var Validator = require('../../util/validator'),
    predicates = require('./predicates');

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

    function matchesPredicate (fieldName, predicate, request) {
        return Object.keys(predicate).every(function (key) {
            return predicates[key](fieldName, predicate[key], request);
        });
    }

    function findFirstMatch (request) {
        if (stubs.length === 0) {
            return undefined;
        }
        var matches = stubs.filter(function (stub) {
            var predicates = stub.predicates || {};
            return Object.keys(predicates).every(function (fieldName) {
                return matchesPredicate(fieldName, predicates[fieldName], request);
            });
        });
        return (matches.length === 0) ? undefined : matches[0];
    }

    function isValidStubRequest (stub) {
        return stubRequestErrorsFor(stub).length === 0;
    }

    function stubRequestErrorsFor (stub) {
        var spec = {
            requireNonEmptyArrays: { responses: stub.responses }
        };
        if (stub.predicates) {
            spec.requireValidPredicates = {
                path: stub.predicates.path,
                method: stub.predicates.method,
                body: stub.predicates.body
            };
        }
        return Validator.create(spec).errors();
    }

    function addStub (stub) {
        stubs.push(stub);
    }

    function resolve (request) {
        var stubResponse = {},
            stub = findFirstMatch(request);

        if (stub) {
            var stubResolver = stub.responses.shift();
            stubResponse = stubResolver.is;
            stub.responses.push(stubResolver);
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
