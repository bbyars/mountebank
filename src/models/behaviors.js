'use strict';

/**
 * The functionality behind the _behaviors field in the API, supporting post-processing responses
 * @module
 */

var exceptions = require('../util/errors');

function defined (value) {
    return typeof value !== 'undefined';
}

function ofType (value) {
    var allowedTypes = Array.prototype.slice.call(arguments),
        actualType = typeof value,
        util = require('util');

    // remove value
    allowedTypes.shift();

    // allow passing in array
    if (util.isArray(allowedTypes[0])) {
        allowedTypes = allowedTypes[0];
    }

    return allowedTypes.indexOf(actualType) >= 0;
}

function hasExactlyOneKey (obj) {
    var keys = Object.keys(obj);
    return keys.length === 1;
}

function navigate (config, path) {
    if (path === '') {
        return config;
    }
    else {
        return path.split('.').reduce(function (field, fieldName) {
            return field[fieldName];
        }, config);
    }
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

function typeErrorMessageFor (spec) {
    var util = require('util'),
        spellings = { number: 'a', object: 'an', string: 'a', array: 'an' },
        message = util.format('%s behavior "%s" field must be %s %s',
            spec.behaviorName, spec.path, spellings[spec.allowedTypes[0]], spec.allowedTypes[0]);

    for (var i = 1; i < spec.allowedTypes.length; i += 1) {
        message += util.format(' or %s %s', spellings[spec.allowedTypes[i]], spec.allowedTypes[i]);
    }
    if (spec.additionalContext) {
        message += ', representing ' + spec.additionalContext;
    }
    return message;
}

function pathFor (pathPrefix, fieldName) {
    if (pathPrefix === '') {
        return fieldName;
    }
    else {
        return pathPrefix + '.' + fieldName;
    }
}

function nonMetadata (fieldName) {
    return fieldName.indexOf('_') !== 0;
}

function addErrorsTo (errors, config, behaviorName, pathPrefix, spec) {
    /* eslint-disable no-underscore-dangle */
    Object.keys(spec).filter(nonMetadata).forEach(function (fieldName) {
        /* eslint complexity: [2, 8] */
        /* eslint max-depth: [2, 4] */
        var util = require('util'),
            fieldSpec = spec[fieldName],
            path = pathFor(pathPrefix, fieldName),
            field = navigate(config, path),
            fieldType = typeof field;

        if (fieldType === 'undefined') {
            if (fieldSpec._required) {
                errors.push(exceptions.ValidationError(
                    util.format('%s behavior "%s" field required', behaviorName, path),
                    { source: config }));
            }
        }
        else {
            var allowedTypes = Object.keys(fieldSpec._allowedTypes),
                typeSpec = fieldSpec._allowedTypes[fieldType];

            if (typeof typeSpec === 'undefined') {
                errors.push(exceptions.ValidationError(
                    typeErrorMessageFor({
                        behaviorName: behaviorName,
                        path: path,
                        allowedTypes: allowedTypes,
                        additionalContext: fieldSpec._additionalContext
                    }),
                    { source: config }));
            }
            else {
                if (typeSpec.singleKeyOnly && !hasExactlyOneKey(field)) {
                    errors.push(exceptions.ValidationError(
                        util.format('%s behavior "%s" field must have exactly one key',
                            behaviorName, path),
                        { source: config }));
                }
                else if (typeSpec.enum) {
                    var enumField = field;
                    if (typeof field === 'object' && Object.keys(field).length > 0) {
                        enumField = Object.keys(field)[0];
                    }
                    if (typeSpec.enum.indexOf(enumField) < 0) {
                        errors.push(exceptions.ValidationError(
                            util.format('%s behavior "%s" field must be one of [%s]',
                                behaviorName, path, typeSpec.enum.join(', ')),
                            { source: config }));
                    }
                }

                addErrorsTo(errors, config, behaviorName, path, fieldSpec);
            }
        }
    });
}

function addCopyErrors (config, errors) {
    var util = require('util');

    if (!util.isArray(config.copy)) {
        errors.push(exceptions.ValidationError('"copy" behavior must be an array',
            { source: config }));
    }
    else {
        config.copy.forEach(function (copyConfig) {
            addErrorsTo(errors, copyConfig, 'copy', '', {
                from: {
                    _required: true,
                    _allowedTypes: {
                        string: {},
                        object: { singleKeyOnly: true }
                    },
                    _additionalContext: 'the request field to select from'
                },
                into: {
                    _required: true,
                    _allowedTypes: { string: {} },
                    _additionalContext: 'the token to replace in response fields'
                },
                using: {
                    _required: true,
                    _allowedTypes: { object: {} },
                    method: {
                        _required: true,
                        _allowedTypes: { string: { enum: ['regex', 'xpath', 'jsonpath'] } }
                    },
                    selector: {
                        _required: true,
                        _allowedTypes: { string: {} }
                    }
                }
            });
        });
    }
}

function addLookupErrors (config, errors) {
    var util = require('util');

    if (!util.isArray(config.lookup)) {
        errors.push(exceptions.ValidationError('"lookup" behavior must be an array',
            { source: config }));
    }
    else {
        config.lookup.forEach(function (lookupConfig) {
            addErrorsTo(errors, lookupConfig, 'lookup', '', {
                key: {
                    _required: true,
                    _allowedTypes: { object: {} },
                    from: {
                        _required: true,
                        _allowedTypes: { string: {}, object: {} }
                    },
                    using: {
                        _required: true,
                        _allowedTypes: { object: {} },
                        method: {
                            _required: true,
                            _allowedTypes: { string: { enum: ['regex', 'xpath', 'jsonpath'] } }
                        },
                        selector: {
                            _required: true,
                            _allowedTypes: { string: {} }
                        }
                    }
                },
                fromDataSource: {
                    _required: true,
                    _allowedTypes: { object: { singleKeyOnly: true, enum: ['csv'] } }, // fix
                    csv: {
                        _required: false,
                        _allowedTypes: { object: {} },
                        path: {
                            _required: true,
                            _allowedTypes: { string: {} },
                            _additionalContext: 'the path to the CSV file'
                        },
                        keyColumn: {
                            _required: true,
                            _allowedTypes: { string: {} },
                            _additionalContext: 'the column header to select against the "key" field'
                        }
                    }
                },
                into: {
                    _required: true,
                    _allowedTypes: { string: {} },
                    _additionalContext: 'the token to replace in response fields'
                }
            });
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

    var util = require('util'),
        fn = util.format('(%s)()', millisecondsOrFn),
        milliseconds = parseInt(millisecondsOrFn),
        Q = require('q');

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
    var json = JSON.stringify(obj),
        isWindows = require('os').platform().indexOf('win') === 0,
        util = require('util');

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
        var Q = require('q'),
            deferred = Q.defer(),
            util = require('util'),
            exec = require('child_process').exec,
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
        var Q = require('q'),
            helpers = require('../util/helpers'),
            request = helpers.clone(originalRequest),
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
        var result = obj[getKeyIgnoringCase(obj, from)],
            util = require('util');

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
        var xpath = require('./xpath');
        return xpath.select(config.using.selector, config.using.ns, from, logger);
    };
    return getMatches(selectionFn, config.using.selector, logger);
}

function jsonpathValue (from, config, logger) {
    var selectionFn = function () {
        var jsonpath = require('./jsonpath');
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
            var util = require('util'),
                indexedToken = util.format('%s[%s]', token, index);
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
        var Q = require('q');

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

function createRowObject (headers, rowArray) {
    var row = {};
    rowArray.forEach(function (value, index) {
        row[headers[index]] = value;
    });
    return row;
}

function selectRowFromCSV (csvConfig, keyValue, logger) {
    var fs = require('fs'),
        Q = require('q'),
        headers,
        inputStream = fs.createReadStream(csvConfig.path),
        parser = require('csv-parse')({ delimiter: ',' }),
        pipe = inputStream.pipe(parser),
        deferred = Q.defer();

    inputStream.on('error', function (e) {
        logger.error('Cannot read ' + csvConfig.path + ': ' + e);
        deferred.resolve({});
    });

    pipe.on('data', function (rowArray) {
        if (!defined(headers)) {
            headers = rowArray;
        }
        else {
            var row = createRowObject(headers, rowArray);
            if (row[csvConfig.keyColumn].localeCompare(keyValue) === 0) {
                deferred.resolve(row);
            }
        }
    });

    pipe.on('end', function () {
        deferred.resolve({});
    });

    return deferred.promise;
}

function lookupRow (lookupConfig, originalRequest, logger) {
    var Q = require('q'),
        from = getFrom(originalRequest, lookupConfig.key.from),
        fnMap = { regex: regexValue, xpath: xpathValue, jsonpath: jsonpathValue },
        keyValues = fnMap[lookupConfig.key.using.method](from, lookupConfig.key, logger),
        index = lookupConfig.key.index || 0;

    if (lookupConfig.fromDataSource.csv) {
        return selectRowFromCSV(lookupConfig.fromDataSource.csv, keyValues[index], logger);
    }
    else {
        return Q({});
    }
}

function replaceObjectValuesIn (response, token, values, logger) {
    var replacer = function (field) {
        Object.keys(values).forEach(function (key) {
            var util = require('util');

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
        var Q = require('q'),
            lookupPromises = lookupArray.map(function (lookupConfig) {
                return lookupRow(lookupConfig, originalRequest, logger).then(function (row) {
                    replaceObjectValuesIn(response, lookupConfig.into, row, logger);
                });
            });
        return Q.all(lookupPromises).then(function () { return Q(response); });
    }).catch(function (error) {
        logger.error(error);
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
        return require('q')(response);
    }

    var Q = require('q'),
        combinators = require('../util/combinators'),
        waitFn = behaviors.wait ?
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
