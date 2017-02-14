'use strict';

/**
 * The functionality behind the _behaviors field in the API, supporting post-processing responses
 * @module
 */

var helpers = require('../util/helpers'),
    exceptions = require('../util/errors'),
    Q = require('q'),
    exec = require('child_process').exec,
    util = require('util'),
    combinators = require('../util/combinators'),
    xpath = require('./xpath'),
    jsonpath = require('./jsonpath'),
    csvToObject = require('csv-to-object'),
    hashmap = require('hashmap'),
    isWindows = require('os').platform().indexOf('win') === 0;

function defined (value) {
    return typeof value !== 'undefined';
}

function ofType (value) {
    var allowedTypes = Array.prototype.slice.call(arguments),
        actualType = typeof value;

    // remove value
    allowedTypes.shift();

    return allowedTypes.indexOf(actualType) >= 0;
}

function missingRequiredFields (obj) {
    var requiredFields = Array.prototype.slice.call(arguments),
        actualFields = Object.keys(obj),
        missingFields = [];

    // remove obj
    requiredFields.shift();

    requiredFields.forEach(function (field) {
        if (actualFields.indexOf(field) < 0) {
            missingFields.push(field);
        }
    });
    return missingFields;
}

function addWaitErrors (config, errors) {
    if (!ofType(config.wait, 'number', 'string') || (typeof config.wait === 'number' && config.wait < 0)) {
        errors.push(exceptions.ValidationError('"wait" value must be an integer greater than or equal to 0',
          { source: config }));
    }
}

function addRepeatErrors (config, errors) {
    if (!ofType(config.repeat, 'number', 'string') || config.repeat <= 0) {
        errors.push(exceptions.ValidationError('"repeat" value must be an integer greater than 0',
            { source: config }));
    }
}

function addCopyFromErrors (config, errors) {
    if (!defined(config.from)) {
        return;
    }
    if (!ofType(config.from, 'string', 'object')) {
        errors.push(exceptions.ValidationError('copy behavior "from" field must be a string or an object, representing the request field to copy from',
            { source: config }));
    }
    else if (typeof config.from === 'object') {
        var keys = Object.keys(config.from);
        if (keys.length === 0 || keys.length > 1) {
            errors.push(exceptions.ValidationError('copy behavior "from" field can only have one key per object',
            { source: config }));
        }
    }
}

function addCopyIntoErrors (config, errors) {
    if (!defined(config.into)) {
        return;
    }
    if (!ofType(config.into, 'string')) {
        errors.push(exceptions.ValidationError('copy behavior "into" field must be a string, representing the token to replace in response fields',
            { source: config }));
    }
}

function addCopyUsingErrors (config, errors) {
    if (!defined(config.using)) {
        return;
    }
    missingRequiredFields(config.using, 'method', 'selector').forEach(function (field) {
        errors.push(exceptions.ValidationError('copy behavior "using.' + field + '" field required',
            { source: config }));
    });
    if (defined(config.using.method) && ['regex', 'xpath', 'jsonpath'].indexOf(config.using.method) < 0) {
        errors.push(exceptions.ValidationError('copy behavior "using.method" field must be one of [regex, xpath, jsonpath]',
            { source: config }));
    }
}

function addCopyErrors (config, errors) {
    if (!util.isArray(config.copy)) {
        errors.push(exceptions.ValidationError('"copy" behavior must be an array',
            { source: config }));
    }
    else {
        config.copy.forEach(function (copyConfig) {
            missingRequiredFields(copyConfig, 'from', 'into', 'using').forEach(function (field) {
                errors.push(exceptions.ValidationError('copy behavior "' + field + '" field required',
                    { source: copyConfig }));
            });
            addCopyFromErrors(copyConfig, errors);
            addCopyIntoErrors(copyConfig, errors);
            addCopyUsingErrors(copyConfig, errors);
        });
    }
}

function addLookupPathErrors (config, errors) {
    if (!defined(config.path)) {
        return;
    }
    if (!ofType(config.path, 'string')) {
        errors.push(exceptions.ValidationError('lookup behavior "path" field must be a string, representing the token to fetch values from CSV',
            { source: config }));
    }
}

function addLookupColumnMatchErrors (config, errors) {
    if (!defined(config.columnMatch)) {
        return;
    }
    if (!ofType(config.columnMatch, 'string')) {
        errors.push(exceptions.ValidationError('lookup behavior "columnMatch" field must be a string, representing the token to match column in CSV with xpath, jsonpath, or regex value',
            { source: config }));
    }
}

function addLookupColumnIntoErrors (config, errors) {
    if (!defined(config.columnInto)) {
        return;
    }
    if (!ofType(config.columnInto, 'object')) {
        errors.push(exceptions.ValidationError('lookup behavior "columnInto" field must be a string or an object, representing the request field to pass values of column in response',
            { source: config }));
    }
    else if (typeof config.columnInto === 'object') {
        var keys = Object.keys(config.columnInto);
        if (keys.length === 0) {
            errors.push(exceptions.ValidationError('lookup behavior "columnInto" field can only have one key per object',
                { source: config }));
        }
    }
}

function addLookupKeyUsingErrors (config, errors) {
    if (!defined(config.using)) {
        return;
    }
    if (!ofType(config.using, 'object')) {
        errors.push(exceptions.ValidationError('using should be an object',
            { source: config.using }));
    }
    if (!ofType(config.using.method, 'string')) {
        errors.push(exceptions.ValidationError('method should be an string',
            { source: config.using.method }));
    }
    if (!ofType(config.using.selector, 'string')) {
        errors.push(exceptions.ValidationError('selector should be an string',
            { source: config.using.selector }));
    }

}

function addLookupKeyFromErrors (config, errors) {
    if (!defined(config.from)) {
        return;
    }
    if (!ofType(config.from, 'string')) {
        errors.push(exceptions.ValidationError('from should be an string',
            { source: config.from }));
    }
}

function addLookupKeyErrors (config, errors) {
    if (!defined(config.key)) {
        return;
    }
    if (!ofType(config.key, 'Object')) {
        missingRequiredFields(config.key, 'from', 'using').forEach(function (field) {
            errors.push(exceptions.ValidationError('lookup behavior "' + field + '" field required',
                { source: config.key }));
        });
    }
    addLookupKeyUsingErrors(config.key, errors);
    addLookupKeyFromErrors(config.key, errors);
}

function addLookupSourceErrors (config, errors) {
    if (!defined(config.fromDataSource)) {
        return;
    }
    if (!ofType(config.fromDataSource.csv, 'Object')) {
        missingRequiredFields(config.fromDataSource.csv, 'path', 'columnMatch', 'columnInto').forEach(function (field) {
            errors.push(exceptions.ValidationError('lookup behavior "' + field + '" field required',
                { source: config.fromDataSource.csv }));
        });
    }
    addLookupPathErrors(config.fromDataSource.csv, errors);
    addLookupColumnMatchErrors(config.fromDataSource.csv, errors);
    addLookupColumnIntoErrors(config.fromDataSource.csv, errors);
}

function addlookupErrors (config, errors) {
    if (!util.isArray(config.lookup)) {
        errors.push(exceptions.ValidationError('"lookup" behavior must be an array',
            { source: config }));
    }
    else {
        config.lookup.forEach(function (csvdatasourceconfig) {
            missingRequiredFields(csvdatasourceconfig, 'key', 'fromDataSource', 'into').forEach(function (field) {
                errors.push(exceptions.ValidationError('lookup behavior "' + field + '" field required',
                    { source: csvdatasourceconfig }));
            });
            addLookupKeyErrors(csvdatasourceconfig, errors);
            addLookupSourceErrors(csvdatasourceconfig, errors);
        });
    }
}

function addShellTransformErrors (config, errors) {
    if (!ofType(config.shellTransform, 'string')) {
        errors.push(exceptions.ValidationError('"shellTransform" value must be a string of the path to a command line application',
            { source: config }));
    }
}

function addDecorateErrors (config, errors) {
    if (!ofType(config.decorate, 'string')) {
        errors.push(exceptions.ValidationError('"decorate" value must be a string representing a JavaScript function',
            { source: config }));
    }
}

/**
 * Validates the behavior configuration and returns all errors
 * @param {Object} config - The behavior configuration
 * @returns {Object} The array of errors
 */
function validate (config) {
    var errors = [],
        validations = {
            wait: addWaitErrors,
            repeat: addRepeatErrors,
            copy: addCopyErrors,
            lookup: addlookupErrors,
            shellTransform: addShellTransformErrors,
            decorate: addDecorateErrors
        };
    Object.keys(config || {}).forEach(function (key) {
        if (validations[key]) {
            validations[key](config, errors);
        }
    });

    return errors;
}

/**
 * Waits a specified number of milliseconds before sending the response.  Due to the approximate
 * nature of the timer, there is no guarantee that it will wait the given amount, but it will be close.
 * @param {Object} request - The request object
 * @param {Object} responsePromise -kThe promise returning the response
 * @param {number} millisecondsOrFn - The number of milliseconds to wait before returning, or a function returning milliseconds
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object} A promise resolving to the response
 */
function wait (request, responsePromise, millisecondsOrFn, logger) {
    if (request.isDryRun) {
        return responsePromise;
    }

    var fn = util.format('(%s)()', millisecondsOrFn),
        milliseconds = parseInt(millisecondsOrFn);

    if (isNaN(milliseconds)) {
        try {
            milliseconds = eval(fn);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(fn));
            return Q.reject(exceptions.InjectionError('invalid wait injection',
                { source: millisecondsOrFn, data: error.message }));
        }
    }

    logger.debug('Waiting %s ms...', milliseconds);
    return responsePromise.delay(milliseconds);
}

function quoteForShell (obj) {
    var json = JSON.stringify(obj);

    if (isWindows) {
        // Confused? Me too. All other approaches I tried were spectacular failures
        // in both 1) keeping the JSON as a single CLI arg, and 2) maintaining the inner quotes
        return util.format('"%s"', json.replace(/"/g, '\\"'));
    }
    else {
        return util.format("'%s'", json);
    }
}

/**
 * Runs the response through a shell function, passing the JSON in as stdin and using
 * stdout as the new response
 * @param {Object} request - Will be the first arg to the command
 * @param {Object} responsePromise - The promise chain for building the response, which will be the second arg
 * @param {string} command - The shell command to execute
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function shellTransform (request, responsePromise, command, logger) {
    if (request.isDryRun) {
        return responsePromise;
    }

    return responsePromise.then(function (response) {
        var deferred = Q.defer(),
            fullCommand = util.format('%s %s %s', command, quoteForShell(request), quoteForShell(response));

        logger.debug('Shelling out to %s', command);
        logger.debug(fullCommand);

        exec(fullCommand, function (error, stdout, stderr) {
            if (error) {
                if (stderr) {
                    logger.error(stderr);
                }
                deferred.reject(error.message);
            }
            else {
                logger.debug("Shell returned '%s'", stdout);
                try {
                    deferred.resolve(Q(JSON.parse(stdout)));
                }
                catch (err) {
                    deferred.reject(util.format("Shell command returned invalid JSON: '%s'", stdout));
                }
            }
        });
        return deferred.promise;
    });
}

/**
 * Runs the response through a post-processing function provided by the user
 * @param {Object} originalRequest - The request object, in case post-processing depends on it
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} fn - The function that performs the post-processing
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function decorate (originalRequest, responsePromise, fn, logger) {
    if (originalRequest.isDryRun === true) {
        return responsePromise;
    }

    return responsePromise.then(function (response) {
        var request = helpers.clone(originalRequest),
            injected = '(' + fn + ')(request, response, logger);';

        try {
            // Support functions that mutate response in place and those
            // that return a new response
            var result = eval(injected);
            if (!result) {
                result = response;
            }
            return Q(result);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(injected));
            logger.error('    request: ' + JSON.stringify(request));
            logger.error('    response: ' + JSON.stringify(response));
            return Q.reject(exceptions.InjectionError('invalid decorator injection',
                { source: injected, data: error.message }));
        }
    });
}

function getKeyIgnoringCase (obj, expectedKey) {
    return Object.keys(obj).find(function (key) {
        if (key.toLowerCase() === expectedKey.toLowerCase()) {
            return key;
        }
        else {
            return undefined;
        }
    });
}

function getFrom (obj, from) {
    if (typeof from === 'object') {
        var keys = Object.keys(from);
        return getFrom(obj[keys[0]], from[keys[0]]);
    }
    else {
        var result = obj[getKeyIgnoringCase(obj, from)];

        // Some request fields, like query parameters, can be multi-valued
        if (util.isArray(result)) {
            return result[0];
        }
        else {
            return result;
        }
    }
}

function regexFlags (options) {
    var result = '';
    if (options && options.ignoreCase) {
        result += 'i';
    }
    if (options && options.multiline) {
        result += 'm';
    }
    return result;
}

function getMatches (selectionFn, selector, logger) {
    var matches = selectionFn();

    if (matches && matches.length > 0) {
        return matches;
    }
    else {
        logger.debug('No match for "%s"', selector);
        return [];
    }
}

function regexValue (from, copyConfig, logger) {
    var regex = new RegExp(copyConfig.using.selector, regexFlags(copyConfig.using.options)),
        selectionFn = function () {
            return regex.exec(from);
        };
    return getMatches(selectionFn, regex, logger);
}

function xpathValue (from, copyConfig, logger) {
    var selectionFn = function () {
        return xpath.select(copyConfig.using.selector, copyConfig.using.ns, from, logger);
    };
    return getMatches(selectionFn, copyConfig.using.selector, logger);
}

function jsonpathValue (from, copyConfig, logger) {
    var selectionFn = function () {
        return jsonpath.select(copyConfig.using.selector, from, logger);
    };
    return getMatches(selectionFn, copyConfig.using.selector, logger);
}

function globalStringReplace (str, substring, newSubstring, logger) {
    if (substring !== newSubstring) {
        logger.debug('Replacing %s with %s', JSON.stringify(substring), JSON.stringify(newSubstring));
        return str.split(substring).join(newSubstring);
    }
    else {
        return str;
    }
}

function replace (obj, token, values, logger) {
    Object.keys(obj).forEach(function (key) {
        if (typeof obj[key] === 'string') {
            values.forEach(function (replacement, index) {
                // replace ${TOKEN}[1] with indexed element
                var indexedToken = util.format('%s[%s]', token, index);
                obj[key] = globalStringReplace(obj[key], indexedToken, replacement, logger);
            });
            if (values.length > 0) {
                // replace ${TOKEN} with first element
                obj[key] = globalStringReplace(obj[key], token, values[0], logger);
            }
        }
        else if (typeof obj[key] === 'object') {
            replace(obj[key], token, values, logger);
        }
    });
}

/**
 * Runs the response through a post-processing function provided by the user
 * @param {Object} originalRequest - The request object, in case post-processing depends on it
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} copyArray - The list of values to copy
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function copy (originalRequest, responsePromise, copyArray, logger) {
    return responsePromise.then(function (response) {
        copyArray.forEach(function (copyConfig) {
            var from = getFrom(originalRequest, copyConfig.from),
                using = copyConfig.using || {},
                fnMap = { regex: regexValue, xpath: xpathValue, jsonpath: jsonpathValue },
                values = [];

            if (fnMap[using.method]) {
                values = fnMap[using.method](from, copyConfig, logger);
            }
            replace(response, copyConfig.into, values, logger);
        });
        return Q(response);
    });
}

function keyFound (path, columnMatch, result, values, index) {
    var flag = true;
    var storeColumnIntoValues = [];
    var dataToObject = csvToObject({ filename: path });
    Object.keys(dataToObject).forEach(function (key) {
        Object.keys(dataToObject[key]).forEach(function () {
            var keyCheck = (dataToObject[key][columnMatch]);
            if ((flag) && (defined(keyCheck)) && (keyCheck.localeCompare(values[index]) === 0)) {
                for (var t = 1; t <= result.length; t += 1) {
                    var intoSubset = result[t - 1];
                    var outputCheck = dataToObject[key][intoSubset];
                    if (defined(outputCheck)) {
                        storeColumnIntoValues.push(outputCheck.trim());
                    }
                    flag = false;
                }
            }
        });
    });
    return storeColumnIntoValues;
}

function columnIntoValue (obj) {
    var result = [];
    Object.keys(obj).forEach(function (key) {
        result.push(obj[key]);
    });
    return result;
}


function lookup (originalRequest, responsePromise, lookupArray, logger) {
    return responsePromise.then(function (response) {
        lookupArray.forEach(function (lookupConfig) {
            var path, columnMatch, index, map = new hashmap();
            var into = lookupConfig.into;
            if (typeof lookupConfig === 'object') {
                path = lookupConfig.fromDataSource.csv.path;
                columnMatch = lookupConfig.fromDataSource.csv.columnMatch;
                if (typeof lookupConfig.key.index === 'undefined') {
                    index = 0;
                }
                else {
                    index = lookupConfig.key.index;
                }
                var from = getFrom(originalRequest, lookupConfig.key.from),
                    fnMap = { regex: regexValue, xpath: xpathValue, jsonpath: jsonpathValue },
                    values = [];
                if (fnMap[lookupConfig.key.using.method]) {
                    values = fnMap[lookupConfig.key.using.method](from, lookupConfig.key, logger);
                }
                var result = columnIntoValue(lookupConfig.fromDataSource.csv.columnInto);
                var saveValues = keyFound(path, columnMatch, result, values, index, response);
                for (var i = 0; i < saveValues.length; i += 1) {
                    map.set(result[i], saveValues[i]);
                }
                replace(response, into, map, logger);
            }
        });
        return Q(response);
    });
}

/**
 * The entry point to execute all behaviors provided in the API
 * @param {Object} request - The request object
 * @param {Object} response - The response generated from the stubs
 * @param {Object} behaviors - The behaviors specified in the API
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object}
 */
function execute (request, response, behaviors, logger) {
    if (!behaviors) {
        return Q(response);
    }

    var waitFn = behaviors.wait ?
        function (result) { return wait(request, result, behaviors.wait, logger); } :
        combinators.identity,
        copyFn = behaviors.copy ?
        function (result) { return copy(request, result, behaviors.copy, logger); } :
        combinators.identity,
        lookupFn = behaviors.lookup ?
        function (result) { return lookup(request, result, behaviors.lookup, logger); } :
        combinators.identity,
        shellTransformFn = behaviors.shellTransform ?
        function (result) { return shellTransform(request, result, behaviors.shellTransform, logger); } :
        combinators.identity,
        decorateFn = behaviors.decorate ?
        function (result) { return decorate(request, result, behaviors.decorate, logger); } :
        combinators.identity;

    logger.debug('using stub response behavior ' + JSON.stringify(behaviors));

    return combinators.compose(decorateFn, shellTransformFn, copyFn, lookupFn, waitFn, Q)(response);
}

module.exports = {
    validate: validate,
    execute: execute
};
