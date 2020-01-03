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

    function reposToTestFor (stub) {
        // Test with predicates (likely won't match) to make sure predicates don't blow up
        // Test without predicates (always matches) to make sure response doesn't blow up
        const stubsToValidateWithPredicates = stub.responses.map(response => stubForResponse(stub, response, true)),
            stubsToValidateWithoutPredicates = stub.responses.map(response => stubForResponse(stub, response, false)),
            stubsToValidate = stubsToValidateWithPredicates.concat(stubsToValidateWithoutPredicates),
            promises = stubsToValidate.map(stubToValidate => {
                const stubRepository = require('./inMemoryImpostersRepository').create().createStubsRepository();
                return stubRepository.add(stubToValidate).then(() => stubRepository);
            }),
            Q = require('q');

        return Q.all(promises);
    }

    // We call map before calling every so we make sure to call every
    // predicate during dry run validation rather than short-circuiting
    function trueForAll (list, predicate) {
        return list.map(predicate).every(result => result);
    }

    function findFirstMatch (stubRepository, request, encoding, logger) {
        const filter = stubPredicates => {
            const predicates = require('./predicates');

            return trueForAll(stubPredicates,
                predicate => predicates.evaluate(predicate, request, encoding, logger, {}));
        };

        return stubRepository.first(filter);
    }

    function resolverFor (stubRepository) {
        const Q = require('q');

        // We can get a better test (running behaviors on proxied result) if the protocol gives
        // us a testProxyResult
        if (options.testProxyResponse) {
            const dryRunProxy = { to: () => Q(options.testProxyResponse) };
            return require('./responseResolver').create(stubRepository, dryRunProxy);
        }
        else {
            return require('./responseResolver').create(stubRepository, undefined, 'URL');
        }
    }

    function dryRun (stub, encoding, logger) {
        const Q = require('q'),
            combinators = require('../util/combinators'),
            dryRunLogger = {
                debug: combinators.noop,
                info: combinators.noop,
                warn: combinators.noop,
                error: logger.error
            };

        options.testRequest = options.testRequest || {};
        options.testRequest.isDryRun = true;
        return reposToTestFor(stub).then(dryRunRepositories => {
            return Q.all(dryRunRepositories.map(stubRepository => {
                return findFirstMatch(stubRepository, options.testRequest, encoding, dryRunLogger).then(match => {
                    return match.stub.nextResponse().then(responseConfig => {
                        return resolverFor(stubRepository).resolve(responseConfig, options.testRequest, dryRunLogger, {});
                    });
                });
            }));
        });
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

    function hasPredicateGeneratorInjection (response) {
        return response.proxy && response.proxy.predicateGenerators &&
            response.proxy.predicateGenerators.some(generator => generator.inject);
    }

    function hasStubInjection (stub) {
        const hasResponseInjections = stub.responses.some(response => {
                const hasDecorator = response._behaviors && response._behaviors.decorate,
                    hasWaitFunction = response._behaviors && typeof response._behaviors.wait === 'string';

                return response.inject || hasDecorator || hasWaitFunction || hasPredicateGeneratorInjection(response);
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
            Q = require('q');

        validationPromises.push(Q(errorsForRequest(request)));
        if (typeof options.additionalValidation === 'function') {
            validationPromises.push(Q(options.additionalValidation(request)));
        }

        return Q.all(validationPromises).then(errorsForAllStubs => {
            const allErrors = errorsForAllStubs.reduce((stubErrors, accumulator) => accumulator.concat(stubErrors), []);
            return { isValid: allErrors.length === 0, errors: allErrors };
        });
    }

    return { validate };
}

module.exports = { create };
