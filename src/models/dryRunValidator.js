'use strict';

/**
 * Validating a syntactically correct imposter creation statically is quite difficult.
 * This module validates dynamically by running test requests through each predicate and each stub
 * to see if it throws an error.  A valid request is one that passes the dry run error-free.
 * @module
 */

var utils = require('util'),
    Q = require('q'),
    exceptions = require('../util/errors'),
    helpers = require('../util/helpers'),
    combinators = require('../util/combinators'),
    ResponseResolver = require('./responseResolver');

/**
 * Creates the validator
 * @param {Object} options - Configuration for the validator
 * @param {Object} options.testRequest - The protocol-specific request used for each dry run
 * @param {Object} options.StubRepository - The creation function
 * @param {boolean} options.allowInjection - Whether JavaScript injection is allowed or not
 * @param {function} options.additionalValidation - A function that performs protocol-specific validation
 * @returns {Object}
 */
function create (options) {

    function stubForResponse (originalStub, response, withPredicates) {
        // Each dry run only validates the first response, so we
        // explode the number of stubs to dry run each response separately
        var clonedStub = helpers.clone(originalStub),
            clonedResponse = helpers.clone(response);
        clonedStub.responses = [clonedResponse];

        // If the predicates don't match the test request, we won't dry run
        // the response (although the predicates will be dry run).  We remove
        // the predicates to account for this scenario.
        if (!withPredicates) {
            delete clonedStub.predicates;
        }

        // we've already validated waits and don't want to add latency to validation
        if (clonedResponse._behaviors && clonedResponse._behaviors.wait) {
            delete clonedResponse._behaviors.wait;
        }
        return clonedStub;
    }

    function dryRun (stub, encoding, logger) {
        // Need a well-formed proxy response in case a behavior decorator expects certain fields to exist
        var dryRunProxy = { to: function () { return Q(options.testProxyResponse); } },
            dryRunLogger = {
                debug: combinators.noop,
                info: combinators.noop,
                warn: combinators.noop,
                error: logger.error
            },
            resolver = ResponseResolver.create(dryRunProxy, combinators.identity),
            stubsToValidateWithPredicates = stub.responses.map(function (response) {
                return stubForResponse(stub, response, true);
            }),
            stubsToValidateWithoutPredicates = stub.responses.map(function (response) {
                return stubForResponse(stub, response, false);
            }),
            stubsToValidate = stubsToValidateWithPredicates.concat(stubsToValidateWithoutPredicates),
            dryRunRepositories = stubsToValidate.map(function (stubToValidate) {
                var stubRepository = options.StubRepository.create(resolver, false, encoding);
                stubRepository.addStub(stubToValidate);
                return stubRepository;
            });

        return Q.all(dryRunRepositories.map(function (stubRepository) {
            var testRequest = options.testRequest;
            testRequest.isDryRun = true;
            return stubRepository.resolve(testRequest, dryRunLogger);
        }));
    }

    function addDryRunErrors (stub, encoding, errors, logger) {
        var deferred = Q.defer();

        try {
            dryRun(stub, encoding, logger).done(deferred.resolve, function (reason) {
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

    function addInvalidWaitErrors (stub, errors) {
        var hasInvalidWait = stub.responses.some(function (response) {
            return response._behaviors && response._behaviors.wait &&
                (typeof response._behaviors.wait !== 'number' || response._behaviors.wait < 0);
        });

        if (hasInvalidWait) {
            errors.push(exceptions.ValidationError("'wait' value must be an integer greater than or equal to 0", {
                source: stub
            }));
        }
    }

    function hasStubInjection (stub) {
        var hasResponseInjections = utils.isArray(stub.responses) && stub.responses.some(function (response) {
                var hasDecorator = response._behaviors && response._behaviors.decorate;
                return response.inject || hasDecorator;
            }),
            hasPredicateInjections = Object.keys(stub.predicates || {}).some(function (predicate) {
                return stub.predicates[predicate].inject;
            });
        return hasResponseInjections || hasPredicateInjections;
    }

    function addStubInjectionErrors (stub, errors) {
        if (!options.allowInjection && hasStubInjection(stub)) {
            errors.push(exceptions.InjectionError(
                'JavaScript injection is not allowed unless mb is run with the --allowInjection flag', { source: stub }));
        }
    }

    function errorsForStub (stub, encoding, logger) {
        var errors = [],
            deferred = Q.defer();

        if (!utils.isArray(stub.responses) || stub.responses.length === 0) {
            errors.push(exceptions.ValidationError("'responses' must be a non-empty array", {
                source: stub
            }));
        }
        else {
            addInvalidWaitErrors(stub, errors);
        }
        addStubInjectionErrors(stub, errors);

        if (errors.length > 0) {
            // no sense in dry-running if there are already problems;
            // it will just add noise to the errors
            deferred.resolve(errors);
        }
        else {
            addDryRunErrors(stub, encoding, errors, logger).done(function () {
                deferred.resolve(errors);
            });
        }

        return deferred.promise;
    }

    function errorsForRequest (request) {
        var errors = [],
            hasRequestInjection = request.endOfRequestResolver && request.endOfRequestResolver.inject;

        if (!options.allowInjection && hasRequestInjection) {
            errors.push(exceptions.InjectionError(
                'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                { source: request.endOfRequestResolver }));
        }
        return errors;
    }

    /**
     * Validates that the imposter creation is syntactically valid
     * @memberOf module:models/dryRunValidator#
     * @param {Object} request - The request containing the imposter definition
     * @param {Object} logger - The logger
     * @returns {Object} Promise resolving to an object containing isValid and an errors array
     */
    function validate (request, logger) {
        var stubs = request.stubs || [],
            encoding = request.mode === 'binary' ? 'base64' : 'utf8',
            validationPromises = stubs.map(function (stub) { return errorsForStub(stub, encoding, logger); }),
            deferred = Q.defer();

        validationPromises.push(Q(errorsForRequest(request)));
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
