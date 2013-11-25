'use strict';

var Validator = require('../../util/validator'),
    predicates = require('./predicates'),
    Q = require('q');

function create (proxy, allowInjection) {
    var stubs = [],
        injectState = {};

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
        if (!allowInjection && hasInjection(stub)) {
            result.push({
                code: 'invalid operation',
                message: 'inject is not allowed unless mb is run with the --allowInjection flag'
            });
        }
        if (result.length === 0) {
            addDryRunErrors(stub, result);
        }
        return result;
    }

    function hasInjection (stub) {
        var hasResponseInjections = stub.responses.some(function (response) {
                return response.inject;
            }),
            hasPredicateInjections = Object.keys(stub.predicates || {}).some(function (predicate) {
                return stub.predicates[predicate].inject;
            });
        return hasResponseInjections || hasPredicateInjections;
    }

    function addDryRunErrors (stub, errors) {
        try {
            // keep strictly synchronous
            var fakeProxy = {
                    to: function () {
                        return {
                            then: function () { return {}; }
                        };
                    }
                },
                fakeRequest = { path: '/', method: 'GET', headers: {}, body: '' },
                dryRun = create(fakeProxy, allowInjection),
                clone = JSON.parse(JSON.stringify(stub)); // proxyOnce changes state

            dryRun.addStub(clone);
            dryRun.resolve(fakeRequest);
        }
        catch (error) {
            // Avoid digit methods, which probably represent incorrectly using an array, e.g.
            // Object #<Object> has no method '0'
            var invalidPredicate = /has no method '([A-Za-z_]+)'/.exec(error.message),
                message = 'malformed stub request';

            if (invalidPredicate) {
                message = "no predicate '" + invalidPredicate[1] + "'";
            }

            errors.push({
                code: "bad data",
                message: message,
                data: error.message
            });
        }
    }

    function addStub (stub) {
        stubs.push(stub);
    }

    function resolve (request) {
        var stub = findFirstMatch(request) || { responses: [{ is: {} }]},
            stubResolver = stub.responses.shift();

        stub.responses.push(stubResolver);

        if (stubResolver.is) {
            return Q(createResponse(stubResolver.is));
        }
        else if (stubResolver.proxy) {
            return proxy.to(stubResolver.proxy, request);
        }
        else if (stubResolver.proxyOnce) {
            return proxy.to(stubResolver.proxyOnce, request).then(function (response) {
                stubResolver.is = response;
                return Q(response);
            });
        }
        else if (stubResolver.inject) {
            return Q(createResponse(inject(request, stubResolver.inject, injectState)));
        }
        else {
            throw { message: 'unrecognized stub resolver' };
        }
    }

    function inject (request, fn, state) {
        /* jshint evil: true, unused: false */
        var scope = JSON.parse(JSON.stringify(request)),
            injected = '(' + fn + ')(scope, state);';
        return eval(injected);
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
