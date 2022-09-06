'use strict';

const exceptions = require('../util/errors.js'),
    helpers = require('../util/helpers.js'),
    responseResolver = require('./responseResolver.js'),
    inMemoryImpostersRepository = require('./inMemoryImpostersRepository.js'),
    predicates = require('./predicates.js'),
    combinators = require('../util/combinators.js'),
    behaviors = require('./behaviors.js');

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
    function stubForResponse (originalStub, response, withPredicates) {
        // Each dry run only validates the first response, so we
        // explode the number of stubs to dry run each response separately
        const clonedStub = helpers.clone(originalStub),
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
            promises = stubsToValidate.map(async stubToValidate => {
                const stubRepository = inMemoryImpostersRepository.create().createStubsRepository();
                await stubRepository.add(stubToValidate);
                return stubRepository;
            });

        return Promise.all(promises);
    }

    // We call map before calling every so we make sure to call every
    // predicate during dry run validation rather than short-circuiting
    function trueForAll (list, predicate) {
        return list.map(predicate).every(result => result);
    }

    function findFirstMatch (stubRepository, request, encoding, logger) {
        const filter = stubPredicates => {
            return trueForAll(stubPredicates,
                predicate => predicates.evaluate(predicate, request, encoding, logger, {}));
        };

        return stubRepository.first(filter);
    }

    function resolverFor (stubRepository) {
        // We can get a better test (running behaviors on proxied result) if the protocol gives
        // us a testProxyResult
        if (options.testProxyResponse) {
            const dryRunProxy = { to: () => Promise.resolve(options.testProxyResponse) };
            return responseResolver.create(stubRepository, dryRunProxy);
        }
        else {
            return responseResolver.create(stubRepository, undefined, 'URL');
        }
    }

    async function dryRunSingleRepo (stubRepository, encoding, dryRunLogger) {
        const match = await findFirstMatch(stubRepository, options.testRequest, encoding, dryRunLogger),
            responseConfig = await match.stub.nextResponse();

        return resolverFor(stubRepository).resolve(responseConfig, options.testRequest, dryRunLogger, {});
    }

    async function dryRun (stub, encoding, logger) {
        options.testRequest = options.testRequest || {};
        options.testRequest.isDryRun = true;

        const dryRunLogger = {
                debug: combinators.noop,
                info: combinators.noop,
                warn: combinators.noop,
                error: logger.error
            },
            dryRunRepositories = await reposToTestFor(stub),
            dryRuns = dryRunRepositories.map(stubRepository => dryRunSingleRepo(stubRepository, encoding, dryRunLogger));

        return Promise.all(dryRuns);
    }

    async function addDryRunErrors (stub, encoding, errors, logger) {
        try {
            await dryRun(stub, encoding, logger);
        }
        catch (reason) {
            reason.source = reason.source || JSON.stringify(stub);
            errors.push(reason);
        }
    }

    function hasPredicateGeneratorInjection (response) {
        return response.proxy && response.proxy.predicateGenerators &&
            response.proxy.predicateGenerators.some(generator => generator.inject);
    }

    function hasBehavior (response, type, valueFilter) {
        if (typeof valueFilter === 'undefined') {
            valueFilter = () => true;
        }
        return (response.behaviors || []).some(behavior => {
            return typeof behavior[type] !== 'undefined' && valueFilter(behavior[type]);
        });
    }

    function hasStubInjection (stub) {
        const hasResponseInjections = stub.responses.some(response => {
                const hasDecorator = hasBehavior(response, 'decorate'),
                    hasWaitFunction = hasBehavior(response, 'wait', value => typeof value === 'string');

                return response.inject || hasDecorator || hasWaitFunction || hasPredicateGeneratorInjection(response);
            }),
            hasPredicateInjections = Object.keys(stub.predicates || {}).some(predicate => stub.predicates[predicate].inject),
            hasAddDecorateBehaviorInProxy = stub.responses.some(response => response.proxy && response.proxy.addDecorateBehavior);
        return hasResponseInjections || hasPredicateInjections || hasAddDecorateBehaviorInProxy;
    }

    function hasShellExecution (stub) {
        return stub.responses.some(response => hasBehavior(response, 'shellTransform'));
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

    function addRepeatErrorsTo (errors, response) {
        const repeat = response.repeat,
            type = typeof repeat,
            error = exceptions.ValidationError('"repeat" field must be an integer greater than 0', {
                source: response
            });

        if (['undefined', 'number', 'string'].indexOf(type) < 0) {
            errors.push(error);
        }
        if ((type === 'string' && parseInt(repeat) <= 0) || (type === 'number' && repeat <= 0)) {
            errors.push(error);
        }
    }

    function addBehaviorErrors (stub, errors) {
        stub.responses.forEach(response => {
            addAllTo(errors, behaviors.validate(response.behaviors));
            addRepeatErrorsTo(errors, response);
        });
    }

    async function errorsForStub (stub, encoding, logger) {
        const errors = [];

        if (!Array.isArray(stub.responses) || stub.responses.length === 0) {
            errors.push(exceptions.ValidationError("'responses' must be a non-empty array", {
                source: stub
            }));
        }
        else {
            addStubInjectionErrors(stub, errors);
            addBehaviorErrors(stub, errors);
        }

        if (errors.length === 0) {
            // no sense in dry-running if there are already problems;
            // it will just add noise to the errors
            await addDryRunErrors(stub, encoding, errors, logger);
        }

        return errors;
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
    async function validate (request, logger) {
        const stubs = request.stubs || [],
            encoding = request.mode === 'binary' ? 'base64' : 'utf8',
            validations = stubs.map(stub => errorsForStub(stub, encoding, logger));

        validations.push(Promise.resolve(errorsForRequest(request)));
        if (typeof options.additionalValidation === 'function') {
            validations.push(Promise.resolve(options.additionalValidation(request)));
        }

        const errorsForAllStubs = await Promise.all(validations),
            allErrors = errorsForAllStubs.reduce((stubErrors, accumulator) => accumulator.concat(stubErrors), []);
        return { isValid: allErrors.length === 0, errors: allErrors };
    }

    return { validate };
}

module.exports = { create };
