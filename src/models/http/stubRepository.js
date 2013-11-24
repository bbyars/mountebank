'use strict';

var Validator = require('../../util/validator'),
    predicates = require('./predicates'),
    Q = require('q');

function create (proxy) {
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

    function trueForAll (obj, predicate) {
        // we avoid using 'every' to dry run every predicate during validation
        var results = Object.keys(obj).map(predicate);
        return results.every(function (result) { return result; });
    }

    function matchesPredicate (fieldName, predicate, request) {
        return trueForAll(predicate, function (key) {
            return predicates[key](fieldName, predicate[key], request);
        });
    }

    function findFirstMatch (request) {
        if (stubs.length === 0) {
            return undefined;
        }
        var matches = stubs.filter(function (stub) {
            var predicates = stub.predicates || {};
            return trueForAll(predicates, function (fieldName) {
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
        var result = Validator.create(spec).errors();
        if (result.length === 0) {
            addDryRunErrors(stub, result);
        }
        return result;
    }

    function addDryRunErrors (stub, errors) {
        try {
            var dryRun = create(),
                clone = JSON.parse(JSON.stringify(stub));

            // change response to avoid calling proxy during dry run
            clone.responses = [{ body: { is: 'OK' }}];
            dryRun.addStub(clone);
            dryRun.resolve({ path: '/', method: 'GET', headers: {}, body: '' });
        }
        catch (error) {
            // Avoid digit methods, which probably represent incorrectly using an array, e.g.
            // Object #<Object> has no method '0'
            var invalidPredicate = /has no method '([A-Za-z_]+)'/.exec(error.message);
            if (invalidPredicate) {
                errors.push({
                    code: "bad data",
                    message: "no predicate '" + invalidPredicate[1] + "'"
                });
            }
            else {
                errors.push({
                    code: "bad data",
                    message: "malformed predicate"
                });
            }
        }
    }

    function addStub (stub) {
        stubs.push(stub);
    }

    function resolve (request) {
        var stubResponse = {},
            stub = findFirstMatch(request);

        if (stub) {
            var stubResolver = stub.responses.shift();
            stub.responses.push(stubResolver);
            stubResponse = stubResolver.is || {};

            if (stubResolver.proxy) {
                return proxy.to(stubResolver.proxy, request);
            }
            else if (stubResolver.proxyOnce) {
                return proxy.to(stubResolver.proxyOnce, request).then(function (response) {
                    stubResolver.is = response;
                    delete stubResolver.proxyOnce;
                    return Q(response);
                });
            }
        }

        return Q(createResponse(stubResponse));
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
