'use strict';

var Validator = require('../../util/validator'),
    stubRepository = require('./stubRepository'),
    utils = require('util');

function create (request, allowInjection) {

    var strictlySynchronousProxy = {
            to: function () {
                return {
                    then: function (callback) {
                        callback({});
                        return this;
                    }
                };
            }
        };

    function addDryRunErrors (stub, errors) { //TODO: rename; change return value ?
        try {
            var testRequest = { path: '/', method: 'GET', headers: {}, body: '' },
                dryRun = stubRepository.create(strictlySynchronousProxy, allowInjection),//TODO: remove allowInjection
                clone = JSON.parse(JSON.stringify(stub)); // proxyOnce changes state

            dryRun.addStub(clone);
            dryRun.resolve(testRequest);
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
                data: error.message //TODO: Add source: stub
            });
        }
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

    function errorsFor (stub) {
        var spec = {
                requireNonEmptyArrays: { responses: stub.responses }
            };
        if (stub.predicates) { //TODO: Remove?
            spec.requireValidPredicates = {
                path: stub.predicates.path,
                method: stub.predicates.method,
                body: stub.predicates.body
            };
        }
        var result = Validator.create(spec).errors();
        if (!allowInjection && utils.isArray(stub.responses) && hasInjection(stub)) {
            result.push({
                code: 'invalid operation',
                message: 'inject is not allowed unless mb is run with the --allowInjection flag' //TODO: source: stub
            });
        }
        if (result.length === 0) {
            addDryRunErrors(stub, result);
        }
        return result;
    }

    function errors () {
        var stubs = request.stubs || [];

        return stubs.reduce(function (accumulator, stub) {
            return accumulator.concat(errorsFor(stub));
        }, []);
    }

    function isValid () {
        return errors().length === 0;
    }

    return {
        isValid: isValid,
        errors: errors
    };
}

module.exports = {
    create: create
};
