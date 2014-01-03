'use strict';

var utils = require('util'),
    Q = require('q'),
    exceptions = require('../util/errors'),
    helpers = require('../util/helpers'),
    combinators = require('../util/combinators'),
    StubResolver = require('./stubResolver');

function create (options) {

    function dryRun (stub, logger) {
        var dryRunProxy = { to: function () { return Q({}); } },
            errorLogger = logger ? logger.error : combinators.noop,
            dryRunLogger = { debug: combinators.noop, info: combinators.noop, warn: combinators.noop, error: errorLogger },
            resolver = StubResolver.create(dryRunProxy, combinators.identity),
            stubRepository = options.StubRepository.create(resolver),
            clone = helpers.clone(stub); // proxyOnce changes state

        stubRepository.addStub(clone);
        return stubRepository.resolve(options.testRequest, dryRunLogger);
    }

    function addDryRunErrors (stub, errors, logger) {
        var deferred = Q.defer();

        try {
            dryRun(stub, logger).done(deferred.resolve, function (reason) {
                reason.source = reason.source || JSON.stringify(stub);
                errors.push(reason);
                deferred.resolve();
            });
        }
        catch (error) {
            errors.push(exceptions.ValidationError('malformed stub request', {
                data: error.message,
                source: error.source || stub
            }));
            deferred.resolve();
        }

        return deferred.promise;
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
        if (!options.allowInjection && hasInjection(stub)) {
            errors.push(exceptions.InjectionError({ source: stub }));
        }
    }

    function errorsFor (stub, logger) {
        var errors = [],
            deferred = Q.defer();

        if (!utils.isArray(stub.responses) || stub.responses.length === 0) {
            errors.push(exceptions.ValidationError("'responses' must be a non-empty array", {
                source: stub
            }));
        }
        addInjectionErrors(stub, errors);

        if (errors.length > 0) {
            // no sense in dry-running if there are already problems;
            // it will just add noise to the errors
            deferred.resolve(errors);
        }
        else {
            addDryRunErrors(stub, errors, logger).done(function () {
                deferred.resolve(errors);
            });
        }

        return deferred.promise;
    }

    function validate (request, logger) {
        var stubs = request.stubs || [],
            validationPromises = stubs.map(function (stub) { return errorsFor(stub, logger); }),
            deferred = Q.defer();

        if (options.additionalValidation) {
            validationPromises.push(Q(options.additionalValidation(request)));
        }

        Q.all(validationPromises).done(function (errorsForAllStubs) {
            var allErrors = errorsForAllStubs.reduce(function (stubErrors, accumulator) {
                return accumulator.concat(stubErrors);
            }, []);
            deferred.resolve({ isValid: allErrors.length === 0, errors: allErrors });
        });

        return deferred.promise;
    }

    return {
        validate: validate
    };
}

module.exports = {
    create: create
};
