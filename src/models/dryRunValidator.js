'use strict';

/**
 * Validating a syntactically correct imposter creation statically is quite difficult.
 * This module validates dynamically by running test requests through each predicate and each stub
 * to see if it throws an error.  A valid request is one that passes the dry run error-free.
 * @module
 */

/**
 * Creates the validator
 * @param {Object} options - Configuration for the validator
 * @param {Object} options.testRequest - The protocol-specific request used for each dry run
 * @param {Object} options.testProxyResponse - The protocol-specific fake response from a proxy call
 * @param {boolean} options.allowInjection - Whether JavaScript injection is allowed or not
 * @param {function} options.additionalValidation - A function that performs protocol-specific validation
 * @returns {Object}
 */
function create (options) {
    const exceptions = require('../util/errors');

    function stubForResponse (originalStub, response, withPredicates) {
        // Each dry run only validates the first response, so we
        // explode the number of stubs to dry run each response separately
        const helpers = require('../util/helpers'),
            clonedStub = helpers.clone(originalStub),
            clonedResponse = helpers.clone(response);
        clonedStub.responses = [clonedResponse];

        // If the predicates don't match the test request, we won't dry run
        // the response (although the predicates will be dry run).  We remove
        // the predicates to account for this scenario.
        if (!withPredicates) {
            delete clonedStub.predicates;
        }

        return clonedStub;
    }

    function dryRun (stub, encoding, logger) {
        const Q = require('q'),
            combinators = require('../util/combinators'),
            dryRunLogger = {
                debug: combinators.noop,
                info: combinators.noop,
                warn: combinators.noop,
                error: logger.error
            },
            stubsToValidateWithPredicates = stub.responses.map(response => stubForResponse(stub, response, true)),
            stubsToValidateWithoutPredicates = stub.responses.map(response => stubForResponse(stub, response, false)),
            stubsToValidate = stubsToValidateWithPredicates.concat(stubsToValidateWithoutPredicates),
            dryRunRepositories = stubsToValidate.map(stubToValidate => {
                const stubRepository = require('./stubRepository').create(encoding);
                stubRepository.addStub(stubToValidate);
                return stubRepository;
            });

        options.testRequest.isDryRun = true;
        return Q.all(dryRunRepositories.map(stubRepository => {
            // Need a well-formed proxy response in case a behavior decorator expects certain fields to exist
            const dryRunProxy = { to: () => Q(options.testProxyResponse) },
                resolver = require('./responseResolver').create(dryRunProxy),
                responseConfig = stubRepository.getResponseFor(options.testRequest, dryRunLogger, {});
            return resolver.resolve(responseConfig, options.testRequest, dryRunLogger, {});
        }));
    }

    function addDryRunErrors (stub, encoding, errors, logger) {
        const Q = require('q'),
            deferred = Q.defer();

        try {
            dryRun(stub, encoding, logger).done(deferred.resolve, reason => {
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

    function hasStubInjection (stub) {
        const hasResponseInjections = stub.responses.some(response => {
                const hasDecorator = response._behaviors && response._behaviors.decorate,
                    hasWaitFunction = response._behaviors && typeof response._behaviors.wait === 'string';

                return response.inject || hasDecorator || hasWaitFunction;
            }),
            hasPredicateInjections = Object.keys(stub.predicates || {}).some(predicate => stub.predicates[predicate].inject),
            hasAddDecorateBehaviorInProxy = stub.responses.some(response => response.proxy && response.proxy.addDecorateBehavior);
        return hasResponseInjections || hasPredicateInjections || hasAddDecorateBehaviorInProxy;
    }

    function hasShellExecution (stub) {
        return stub.responses.some(response => response._behaviors && response._behaviors.shellTransform);
    }

    function addStubInjectionErrors (stub, errors) {
        if (options.allowInjection) {
            return;
        }

        if (hasStubInjection(stub)) {
            errors.push(exceptions.InjectionError(
                'JavaScript injection is not allowed unless mb is run with the --allowInjection flag', { source: stub }));
        }
        if (hasShellExecution(stub)) {
            errors.push(exceptions.InjectionError(
                'Shell execution is not allowed unless mb is run with the --allowInjection flag', { source: stub }));
        }
    }

    function addAllTo (values, additionalValues) {
        additionalValues.forEach(value => {
            values.push(value);
        });
    }

    function addBehaviorErrors (stub, errors) {
        stub.responses.forEach(response => {
            const behaviors = require('./behaviors');
            addAllTo(errors, behaviors.validate(response._behaviors));
        });
    }

    function errorsForStub (stub, encoding, logger) {
        const errors = [],
            Q = require('q'),
            util = require('util'),
            deferred = Q.defer();

        if (!util.isArray(stub.responses) || stub.responses.length === 0) {
            errors.push(exceptions.ValidationError("'responses' must be a non-empty array", {
                source: stub
            }));
        }
        else {
            addStubInjectionErrors(stub, errors);
            addBehaviorErrors(stub, errors);
        }

        if (errors.length > 0) {
            // no sense in dry-running if there are already problems;
            // it will just add noise to the errors
            deferred.resolve(errors);
        }
        else {
            addDryRunErrors(stub, encoding, errors, logger).done(() => {
                deferred.resolve(errors);
            });
        }

        return deferred.promise;
    }

    function errorsForRequest (request) {
        const errors = [],
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
        const stubs = request.stubs || [],
            encoding = request.mode === 'binary' ? 'base64' : 'utf8',
            validationPromises = stubs.map(stub => errorsForStub(stub, encoding, logger)),
            Q = require('q'),
            deferred = Q.defer();

        validationPromises.push(Q(errorsForRequest(request)));
        if (typeof options.additionalValidation === 'function') {
            validationPromises.push(Q(options.additionalValidation(request)));
        }

        Q.all(validationPromises).done(errorsForAllStubs => {
            const allErrors = errorsForAllStubs.reduce((stubErrors, accumulator) => accumulator.concat(stubErrors), []);
            deferred.resolve({ isValid: allErrors.length === 0, errors: allErrors });
        });

        return deferred.promise;
    }

    return { validate };
}

module.exports = { create };
