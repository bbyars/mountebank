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

function addWaitErrors (config, errors) {
    if (!ofType(config.wait, 'number', 'string') || (typeof config.wait === 'number' && config.wait < 0)) {
        errors.push(exceptions.ValidationError('"wait" value must be an integer greater than or equal to 0', {
            source: config
        }));
    }
}

function addRepeatErrors (config, errors) {
    if (!ofType(config.repeat, 'number', 'string') || config.repeat <= 0) {
        errors.push(exceptions.ValidationError('"repeat" value must be an integer greater than 0', {
            source: config
        }));
    }
}

function addCopyFromErrors (config, errors) {
    if (!defined(config.from)) {
        return;
    }
    if (!ofType(config.from, 'string', 'object')) {
        errors.push(exceptions.ValidationError(
            'copy behavior "from" field must be a string or an object, representing the request field to copy from', {
                source: config
            }));
    }
    else if (typeof config.from === 'object') {
        var keys = Object.keys(config.from);
        if (keys.length === 0 || keys.length > 1) {
            errors.push(exceptions.ValidationError('copy behavior "from" field can only have one key per object', {
                source: config
            }));
        }
    }
}

function addCopyIntoErrors (config, errors) {
    if (!defined(config.into)) {
        return;
    }
    if (!ofType(config.into, 'string')) {
        errors.push(exceptions.ValidationError(
            'copy behavior "into" field must be a string, representing the token to replace in response fields', {
                source: config
            }
        ));
    }
}

function addCopyUsingErrors (config, errors) {
    if (!defined(config.using)) {
        return;
    }
    missingRequiredFields(config.using, 'method', 'selector').forEach(function (field) {
        errors.push(exceptions.ValidationError('copy behavior "using.' + field + '" field required', {
            source: config
        }));
    });
    if (defined(config.using.method) && ['regex', 'xpath', 'jsonpath'].indexOf(config.using.method) < 0) {
        errors.push(exceptions.ValidationError('copy behavior "using.method" field must be one of [regex, xpath, jsonpath]', {
            source: config
        }));
    }
}

function addCopyErrors (config, errors) {
    if (!util.isArray(config.copy)) {
        errors.push(exceptions.ValidationError('"copy" behavior must be an array', {
            source: config
        }));
    }
    else {
        config.copy.forEach(function (copyConfig) {
            missingRequiredFields(copyConfig, 'from', 'into', 'using').forEach(function (field) {
                errors.push(exceptions.ValidationError('copy behavior "' + field + '" field required', {
                    source: copyConfig
                }));
            });
            addCopyFromErrors(copyConfig, errors);
            addCopyIntoErrors(copyConfig, errors);
            addCopyUsingErrors(copyConfig, errors);
        });
    }
}

function addCSV_DatasourceFromErrors (config, errors) {
    if (!defined(config.from)) {
        return;
    }
    if (!ofType(config.from, 'string', 'object')) {
        errors.push(exceptions.ValidationError(
            'CSV_Datasource behavior "from" field must be a string or an object, representing the request field to CSV_Datasource from', {
                source: config
            }));
    }
    else if (typeof config.from === 'object') {
        var keys = Object.keys(config.from);
        if (keys.length === 0 || keys.length > 1) {
            errors.push(exceptions.ValidationError('CSV_Datasource behavior "from" field can only have one key per object', {
                source: config
            }));
        }
    }
}

function addCSV_Datasource_CSV_PathErrors (config, errors) {
    if (!defined(config.into)) {
        return;
    }
    if (!ofType(config.into, 'string')) {
        errors.push(exceptions.ValidationError(
            'CSV_Datasource behavior "CSV_Path" field must be a string, representing the token to fetch values from CSV', {
                source: config
            }
        ));
    }
}

function addCSV_Datasource_Column_MatchErrors (config, errors) {
    if (!defined(config.into)) {
        return;
    }
    if (!ofType(config.into, 'string')) {
        errors.push(exceptions.ValidationError(
            'CSV_Datasource behavior "Column_Match" field must be a string, representing the token to match column in CSV with xpath value', {
                source: config
            }
        ));
    }
}

function addCSV_Datasource_Column_IntoErrors (config, errors) {
    if (!defined(config.Column_into)) {
        return;
    }
    if (!ofType(config.Column_into, 'object')) {
        errors.push(exceptions.ValidationError(
            'CSV_Datasource behavior "Column_Into" field must be a string or an object, representing the request field to pass values of column in response', {
                source: config
            }));
    }
    else if (typeof config.Column_into === 'object') {
        var keys = Object.keys(config.Column_into);
        if (keys.length === 0) {
            errors.push(exceptions.ValidationError('CSV_Datasource behavior "Column_Into" field can only have one key per object', {
                source: config
            }));
        }
    }
}

function addCSV_Datasource_Data_IntoErrors (config, errors) {
    if (!defined(config.Data_into)) {
        return;
    }
    if (!ofType(config.Data_into, 'string')) {
        errors.push(exceptions.ValidationError(
            'CSV_Datasource behavior "Data_into" field must be a string, representing the token to replace in response fields', {
                source: config
            }
        ));
    }
}

function addCSV_DatasourceUsingErrors (config, errors) {
    if (!defined(config.using)) {
        return;
    }
    missingRequiredFields(config.using, 'method', 'selector').forEach(function (field) {
        errors.push(exceptions.ValidationError('CSV_Datasource behavior "using.' + field + '" field required', {
            source: config
        }));
    });
    if (defined(config.using.method) && ['regex', 'xpath', 'jsonpath'].indexOf(config.using.method) < 0) {
        errors.push(exceptions.ValidationError('CSV_Datasource behavior "using.method" field must be one of [regex, xpath, jsonpath]', {
            source: config
        }));
    }
}

function addCSV_DatasourceErrors (config, errors) {
    if (!util.isArray(config.CSV_Datasource)) {
        errors.push(exceptions.ValidationError('"CSV_Datasource" behavior must be an array', {
            source: config
        }));
    }
    else {
        config.CSV_Datasource.forEach(function (CSV_DatasourceConfig) {
            missingRequiredFields(CSV_DatasourceConfig, 'from', 'CSV_Path', 'Column_Match', 'Column_into', 'Data_into', 'using').forEach(function (field) {
                errors.push(exceptions.ValidationError('CSV_Datasource behavior "' + field + '" field required', {
                    source: CSV_DatasourceConfig
                }));
            });
            addCSV_DatasourceFromErrors(CSV_DatasourceConfig, errors);
            addCSV_Datasource_CSV_PathErrors(CSV_DatasourceConfig, errors);
            addCSV_Datasource_Column_MatchErrors(CSV_DatasourceConfig, errors);
            addCSV_Datasource_Column_IntoErrors(CSV_DatasourceConfig, errors);
            addCSV_Datasource_Data_IntoErrors(CSV_DatasourceConfig, errors);
            addCSV_DatasourceUsingErrors(CSV_DatasourceConfig, errors);
        });
    }
}

function addShellTransformErrors (config, errors) {
    if (!ofType(config.shellTransform, 'string')) {
        errors.push(exceptions.ValidationError('"shellTransform" value must be a string of the path to a command line application', {
            source: config
        }));
    }
}

function addDecorateErrors (config, errors) {
    if (!ofType(config.decorate, 'string')) {
        errors.push(exceptions.ValidationError('"decorate" value must be a string representing a JavaScript function', {
            source: config
        }));
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
            CSV_Datasource: addCSV_DatasourceErrors,
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
            return Q.reject(exceptions.InjectionError('invalid wait injection', {
                source: millisecondsOrFn,
                data: error.message
            }));
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
            return Q.reject(exceptions.InjectionError('invalid decorator injection', {
                source: injected,
                data: error.message
            }));
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
                fnMap = {
                    regex: regexValue,
                    xpath: xpathValue,
                    jsonpath: jsonpathValue
                },
                values = [];

            if (fnMap[using.method]) {
                values = fnMap[using.method](from, copyConfig, logger);
            }
            replace(response, copyConfig.into, values, logger);
        });
        return Q(response);
    });
}

function CSV_DATA (CSV_Path, Column_Match, result, values, response) {
    var flag = true;
    var store_columninto_values = [];
    var csv_data = csvToObject({
        filename: CSV_Path
    });
    Object.keys(csv_data).forEach(function (key) {
        Object.keys(csv_data[key]).forEach(function (key1) {
            var key_check = (csv_data[key][Column_Match]);
            if ((flag) && (defined(key_check)) && (key_check.localeCompare(values) === 0)) {
                for (var t = 1; t <= result.length; t += 1) {
                    var into_subset = result[t - 1];
                    var output_check = csv_data[key][into_subset];
                    if (defined(output_check)) {
                        store_columninto_values.push(output_check.trim());
                    }
                    flag = false;
                }
            }
        });
    });
    return store_columninto_values;
}

function CSV_Column_into_Value (obj) {
    var result = [];
    Object.keys(obj).forEach(function (key) {
        result.push(obj[key]);
    });
    return result;
}


function CSV_Datasource (originalRequest, responsePromise, csvobject, logger) {
    return responsePromise.then(function (response) {
        csvobject.forEach(function (csvConfig) {
            var CSV_Path,
                Column_Match,
                Data_into,
                Column_into;
            if (typeof csvConfig === 'object') {
                CSV_Path = csvConfig.CSV_Path;
                Column_Match = csvConfig.Column_Match;
                Data_into = csvConfig.Data_into;
                var from = getFrom(originalRequest, csvConfig.from),
                    using = csvConfig.using || {},
                    fnMap = {
                        regex: regexValue,
                        xpath: xpathValue,
                        jsonpath: jsonpathValue
                    },
                    values = [];
                if (fnMap[using.method]) {
                    values = fnMap[using.method](from, csvConfig, logger);
                }
                var result = CSV_Column_into_Value(csvConfig.Column_into);
                var save_values = CSV_DATA(CSV_Path, Column_Match, result, values, response);
                replace(response, Data_into, save_values, logger);
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
        function (result) {
            return wait(request, result, behaviors.wait, logger);
        } :
        combinators.identity,
        copyFn = behaviors.copy ?
        function (result) {
            return copy(request, result, behaviors.copy, logger);
        } :
        combinators.identity,
        CSV_DatasourceFn = behaviors.CSV_Datasource ?
        function (result) {
            return CSV_Datasource(request, result, behaviors.CSV_Datasource, logger);
        } :
        combinators.identity,
        shellTransformFn = behaviors.shellTransform ?
        function (result) {
            return shellTransform(request, result, behaviors.shellTransform, logger);
        } :
        combinators.identity,
        decorateFn = behaviors.decorate ?
        function (result) {
            return decorate(request, result, behaviors.decorate, logger);
        } :
        combinators.identity;

    logger.debug('using stub response behavior ' + JSON.stringify(behaviors));

    return combinators.compose(decorateFn, shellTransformFn, copyFn, CSV_DatasourceFn, waitFn, Q)(response);
}

module.exports = {
    validate: validate,
    execute: execute
};
