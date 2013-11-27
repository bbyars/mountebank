'use strict';

var Validator = require('../../util/validator'),
    StubRepository = require('./stubRepository'),
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

    function dryRun (stub) {
        var testRequest = { path: '/', method: 'GET', headers: {}, body: '' },
            stubRepository = StubRepository.create(strictlySynchronousProxy),
            clone = JSON.parse(JSON.stringify(stub)); // proxyOnce changes state

        stubRepository.addStub(clone);
        stubRepository.resolve(testRequest);
    }

    function addDryRunErrors (stub, errors) {
        try {
            // Only dry run if no errors
            if (errors.length === 0) {
                dryRun(stub);
            }
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
                code: 'bad data',
                message: message,
                data: error.message,
                source: JSON.stringify(stub)
            });
        }
    }

    function hasInjection (stub) {
        var hasResponseInjections = utils.isArray(stub.responses) && stub.responses.some(function (response) {
                return response.inject;
            }),
            hasPredicateInjections = Object.keys(stub.predicates || {}).some(function (predicate) {
                return stub.predicates[predicate].inject;
            });
        return hasResponseInjections || hasPredicateInjections;
    }

    function addInjectionErrors (stub, errors) {
        if (!allowInjection && hasInjection(stub)) {
            errors.push({
                code: 'invalid operation',
                message: 'inject is not allowed unless mb is run with the --allowInjection flag',
                source: JSON.stringify(stub)
            });
        }
    }

    function errorsFor (stub) {
        var spec = {
                requireNonEmptyArrays: { responses: stub.responses }
            },
            result = Validator.create(spec).errors();
        addInjectionErrors(stub, result);
        addDryRunErrors(stub, result);

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
