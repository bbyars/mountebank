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

function hasExactlyOneKey (obj) {
    var keys = Object.keys(obj);
    return keys.length === 1;
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

// Some of the following validation functions are shared between the copy and lookup behaviors

function addFromErrors (config, behaviorName, fieldPrefix, errors) {
    var fieldName = fieldPrefix.length > 0 ? fieldPrefix + '.from' : 'from';

    if (!defined(config.from)) {
        return;
    }
    if (!ofType(config.from, 'string', 'object')) {
        errors.push(exceptions.ValidationError(
            behaviorName + ' behavior "' + fieldName + '" field must be a string or an object, representing the request field to select from',
            { source: config }));
    }
    else if (typeof config.from === 'object' && !hasExactlyOneKey(config.from)) {
        errors.push(exceptions.ValidationError(behaviorName + ' behavior "' + fieldName + '" field must have exactly one key per object',
            { source: config }));
    }
}

function addIntoErrors (config, behaviorName, errors) {
    if (!defined(config.into)) {
        return;
    }
    if (!ofType(config.into, 'string')) {
        errors.push(exceptions.ValidationError(
            behaviorName + ' behavior "into" field must be a string, representing the token to replace in response fields',
            { source: config }
        ));
    }
}

function addUsingErrors (config, behaviorName, fieldPrefix, errors) {
    var fieldName = fieldPrefix.length > 0 ? fieldPrefix + '.using' : 'using';

    if (!defined(config.using)) {
        return;
    }
    if (!ofType(config.using, 'object')) {
        errors.push(exceptions.ValidationError(
            behaviorName + ' behavior "' + fieldName + '" field must be an object',
            { source: config }));
    }
    else {
        missingRequiredFields(config.using, 'method', 'selector').forEach(function (field) {
            errors.push(exceptions.ValidationError(
                behaviorName + ' behavior "' + fieldName + '.' + field + '" field required',
                { source: config }));
        });
        if (defined(config.using.method) && ['regex', 'xpath', 'jsonpath'].indexOf(config.using.method) < 0) {
            errors.push(exceptions.ValidationError(
                behaviorName + ' behavior "' + fieldName + '.method" field must be one of [regex, xpath, jsonpath]',
                { source: config }));
        }
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
            addFromErrors(copyConfig, 'copy', '', errors);
            addIntoErrors(copyConfig, 'copy', errors);
            addUsingErrors(copyConfig, 'copy', '', errors);
        });
    }
}

function addLookupFromDataSourceCSVPathErrors (config, errors) {
    if (!defined(config.fromDataSource.csv.path)) {
        return;
    }
    if (!ofType(config.fromDataSource.csv.path, 'string')) {
        errors.push(exceptions.ValidationError('lookup behavior "fromDataSource.csv.path" field must be a string, representing the path to the CSV file',
            { source: config }));
    }
}

function addLookupFromDataSourceCSVKeyColumnErrors (config, errors) {
    if (!defined(config.fromDataSource.csv.keyColumn)) {
        return;
    }
    if (!ofType(config.fromDataSource.csv.keyColumn, 'string')) {
        errors.push(exceptions.ValidationError('lookup behavior "fromDataSource.csv.keyColumn" field must be a string, representing the column header to select against the "key" field',
            { source: config }));
    }
}

function addLookupKeyErrors (config, errors) {
    if (!defined(config.key)) {
        return;
    }
    if (!ofType(config.key, 'Object')) {
        missingRequiredFields(config.key, 'from', 'using').forEach(function (field) {
            errors.push(exceptions.ValidationError('lookup behavior "key.' + field + '" field required',
                { source: config.key }));
        });
    }
    addUsingErrors(config.key, 'lookup', 'key', errors);
    addFromErrors(config.key, 'lookup', 'key', errors);
}

function addLookupFromDataSourceCSVErrors (config, errors) {
    if (!ofType(config.fromDataSource.csv, 'object')) {
        errors.push(exceptions.ValidationError('lookup behavior "fromDataSource.csv" field must be an object',
            { source: config }));
        return;
    }

    missingRequiredFields(config.fromDataSource.csv, 'path', 'keyColumn').forEach(function (field) {
        errors.push(exceptions.ValidationError('lookup behavior "fromDataSource.csv.' + field + '" field required',
            { source: config }));
    });
    addLookupFromDataSourceCSVPathErrors(config, errors);
    addLookupFromDataSourceCSVKeyColumnErrors(config, errors);
}

function addLookupFromDataSourceErrors (config, errors) {
    if (!defined(config.fromDataSource)) {
        return;
    }
    if (!ofType(config.fromDataSource, 'object')) {
        errors.push(exceptions.ValidationError(
            'lookup behavior "fromDataSource" field must be an object',
            { source: config }));
        return;
    }

    if (!hasExactlyOneKey(config.fromDataSource)) {
        errors.push(exceptions.ValidationError(
            'lookup behavior "fromDataSource" field must have exactly one key',
            { source: config }));
    }
    if (!defined(config.fromDataSource.csv)) {
        errors.push(exceptions.ValidationError(
            'lookup behavior "fromDataSource" key must be one of [csv] (other data sources may be supported in the future)',
            { source: config }));
    }
    else {
        addLookupFromDataSourceCSVErrors(config, errors);
    }
}

function addLookupErrors (config, errors) {
    if (!util.isArray(config.lookup)) {
        errors.push(exceptions.ValidationError('"lookup" behavior must be an array',
            { source: config }));
    }
    else {
        config.lookup.forEach(function (lookupConfig) {
            missingRequiredFields(lookupConfig, 'key', 'fromDataSource', 'into').forEach(function (field) {
                errors.push(exceptions.ValidationError('lookup behavior "' + field + '" field required',
                    { source: lookupConfig }));
            });
            addLookupKeyErrors(lookupConfig, errors);
            addLookupFromDataSourceErrors(lookupConfig, errors);
            addIntoErrors(lookupConfig, 'lookup', errors);
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
            lookup: addLookupErrors,
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
            return Q.reject(exceptions.InjectionError('invalid decorator injection', { source: injected, data: error.message }));
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

function regexValue (from, config, logger) {
    var regex = new RegExp(config.using.selector, regexFlags(config.using.options)),
        selectionFn = function () { return regex.exec(from); };
    return getMatches(selectionFn, regex, logger);
}

function xpathValue (from, config, logger) {
    var selectionFn = function () {
        return xpath.select(config.using.selector, config.using.ns, from, logger);
    };
    return getMatches(selectionFn, config.using.selector, logger);
}

function jsonpathValue (from, config, logger) {
    var selectionFn = function () {
        return jsonpath.select(config.using.selector, from, logger);
    };
    return getMatches(selectionFn, config.using.selector, logger);
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

function globalObjectReplace (obj, replacer) {
    Object.keys(obj).forEach(function (key) {
        if (typeof obj[key] === 'string') {
            obj[key] = replacer(obj[key]);
        }
        else if (typeof obj[key] === 'object') {
            globalObjectReplace(obj[key], replacer);
        }
    });
}

function replaceArrayValuesIn (response, token, values, logger) {
    var replacer = function (field) {
        values.forEach(function (replacement, index) {
            // replace ${TOKEN}[1] with indexed element
            var indexedToken = util.format('%s[%s]', token, index);
            field = globalStringReplace(field, indexedToken, replacement, logger);
        });
        if (values.length > 0) {
            // replace ${TOKEN} with first element
            field = globalStringReplace(field, token, values[0], logger);
        }
        return field;
    };

    globalObjectReplace(response, replacer);
}

/**
 * Copies a value from the request and replaces response tokens with that value
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
                values = fnMap[using.method](from, copyConfig, logger);

            replaceArrayValuesIn(response, copyConfig.into, values, logger);
        });
        return Q(response);
    });
}

function selectRowFromCSV (csvConfig, keyValue, logger) {
    var keyColumnName = csvConfig.keyColumn,
        csvRows = [];

    try {
        csvRows = csvToObject({ filename: csvConfig.path });
    }
    catch (e) {
        logger.error('Cannot read ' + csvConfig.path + ': ' + e);
    }

    return csvRows.find(function (row) {
        return defined(row[keyColumnName]) && (row[keyColumnName].localeCompare(keyValue) === 0);
    }) || {};
}

function replaceObjectValuesIn (response, token, values, logger) {
    var replacer = function (field) {
        Object.keys(values).forEach(function (key) {
            // replace ${TOKEN}["key"] and ${TOKEN}['key'] and ${TOKEN}[key]
            ['"', "'", ''].forEach(function (quoteChar) {
                var quoted = util.format('%s[%s%s%s]', token, quoteChar, key, quoteChar);
                field = globalStringReplace(field, quoted, values[key], logger);
            });
        });
        return field;
    };

    globalObjectReplace(response, replacer);
}


/**
 * Looks up request values from a data source and replaces response tokens with the resulting data
 * @param {Object} originalRequest - The request object
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} lookupArray - The list of lookup configurations
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function lookup (originalRequest, responsePromise, lookupArray, logger) {
    return responsePromise.then(function (response) {
        lookupArray.forEach(function (lookupConfig) {
            var from = getFrom(originalRequest, lookupConfig.key.from),
                fnMap = { regex: regexValue, xpath: xpathValue, jsonpath: jsonpathValue },
                keyValues = fnMap[lookupConfig.key.using.method](from, lookupConfig.key, logger),
                index = lookupConfig.key.index || 0,
                row = {};

            if (lookupConfig.fromDataSource.csv) {
                row = selectRowFromCSV(lookupConfig.fromDataSource.csv, keyValues[index], logger);
            }

            replaceObjectValuesIn(response, lookupConfig.into, row, logger);
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
