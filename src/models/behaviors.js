'use strict';

/**
 * The functionality behind the behaviors field in the API, supporting post-processing responses
 * @module
 */

const os = require('os'),
    fsExtra = require('fs-extra'),
    childProcess = require('child_process'),
    safeRegex = require('safe-regex'),
    csvParse = require('csv-parse'),
    buffer = require('buffer'),
    prometheus = require('prom-client'),
    xPath = require('./xpath'),
    jsonPath = require('./jsonpath'),
    helpers = require('../util/helpers.js'),
    exceptions = require('../util/errors.js'),
    behaviorsValidator = require('./behaviorsValidator.js'),
    compatibility = require('./compatibility.js');


const metrics = {
    behaviorDuration: new prometheus.Histogram({
        name: 'mb_behavior_duration_seconds',
        help: 'Time it takes to run all the behaviors',
        buckets: [0.05, 0.1, 0.2, 0.5, 1, 3],
        labelNames: ['imposter']
    })
};

// The following schemas are used by both the lookup and copy behaviors and should be kept consistent
const fromSchema = {
        _required: true,
        _allowedTypes: {
            string: {},
            object: { singleKeyOnly: true }
        },
        _additionalContext: 'the request field to select from'
    },
    intoSchema = {
        _required: true,
        _allowedTypes: { string: {} },
        _additionalContext: 'the token to replace in response fields'
    },
    usingSchema = {
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
    },
    validations = {
        wait: {
            _required: true,
            _allowedTypes: { string: {}, number: { nonNegativeInteger: true } }
        },
        copy: {
            from: fromSchema,
            into: intoSchema,
            using: usingSchema
        },
        lookup: {
            key: {
                _required: true,
                _allowedTypes: { object: {} },
                from: fromSchema,
                using: usingSchema
            },
            fromDataSource: {
                _required: true,
                _allowedTypes: { object: { singleKeyOnly: true, enum: ['csv'] } },
                csv: {
                    _required: false,
                    _allowedTypes: { object: {} },
                    path: {
                        _required: true,
                        _allowedTypes: { string: {} },
                        _additionalContext: 'the path to the CSV file'
                    },
                    delimiter: {
                        _required: false,
                        _allowedTypes: { string: {} },
                        _additionalContext: 'the delimiter separator values'
                    },
                    keyColumn: {
                        _required: true,
                        _allowedTypes: { string: {} },
                        _additionalContext: 'the column header to select against the "key" field'
                    }
                }
            },
            into: intoSchema
        },
        shellTransform: {
            _required: true,
            _allowedTypes: { string: {} },
            _additionalContext: 'the path to a command line application'
        },
        decorate: {
            _required: true,
            _allowedTypes: { string: {} },
            _additionalContext: 'a JavaScript function'
        }
    };

/**
 * Validates the behavior configuration and returns all errors
 * @param {Object} config - The behavior configuration
 * @returns {Object} The array of errors
 */
function validate (config) {
    const validator = behaviorsValidator.create();
    return validator.validate(config, validations);
}

/**
 * Waits a specified number of milliseconds before sending the response.  Due to the approximate
 * nature of the timer, there is no guarantee that it will wait the given amount, but it will be close.
 * @param {Object} request - The request object
 * @param {Object} response - The response
 * @param {number} millisecondsOrFn - The number of milliseconds to wait before returning, or a function returning milliseconds
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object} A promise resolving to the response
 */
async function wait (request, response, millisecondsOrFn, logger) {
    const fn = `(${millisecondsOrFn})()`;

    let milliseconds = parseInt(millisecondsOrFn);

    if (isNaN(milliseconds)) {
        try {
            milliseconds = eval(fn);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(fn));
            return Promise.reject(exceptions.InjectionError('invalid wait injection',
                { source: millisecondsOrFn, data: error.message }));
        }
    }

    logger.debug('Waiting %s ms...', milliseconds);
    return new Promise(resolve => {
        setTimeout(() => resolve(response), milliseconds);
    });
}

function quoteForShell (obj) {
    const json = JSON.stringify(obj),
        isWindows = os.platform().indexOf('win') === 0;

    if (isWindows) {
        // Confused? Me too. All other approaches I tried were spectacular failures
        // in both 1) keeping the JSON as a single CLI arg, and 2) maintaining the inner quotes
        return `"${json.replace(/"/g, '\\"')}"`;
    }
    else {
        return `'${json}'`;
    }
}

function execShell (command, request, response, logger) {
    const exec = childProcess.exec,
        env = helpers.clone(process.env),
        maxBuffer = buffer.constants.MAX_STRING_LENGTH,
        maxShellCommandLength = 2048;

    logger.debug(`Shelling out to ${command}`);

    // Switched to environment variables because of inconsistencies in Windows shell quoting
    // Leaving the CLI args for backwards compatibility
    env.MB_REQUEST = JSON.stringify(request);
    env.MB_RESPONSE = JSON.stringify(response);

    // Windows has a pretty low character limit to the command line. When we're in danger
    // of the character limit, we'll remove the command line arguments under the assumption
    // that backwards compatibility doesn't matter when it never would have worked to begin with
    let fullCommand = `${command} ${quoteForShell(request)} ${quoteForShell(response)}`;
    if (fullCommand.length >= maxShellCommandLength) {
        fullCommand = command;
    }

    return new Promise((resolve, reject) => {
        exec(fullCommand, { env, maxBuffer }, (error, stdout, stderr) => {
            if (error) {
                if (stderr) {
                    logger.error(stderr);
                }
                reject(error.message);
            }
            else {
                logger.debug(`Shell returned '${stdout}'`);
                try {
                    resolve(JSON.parse(stdout));
                }
                catch (err) {
                    reject(`Shell command returned invalid JSON: '${stdout}'`);
                }
            }
        });
    });
}

/**
 * Runs the response through a shell function, passing the JSON in as stdin and using
 * stdout as the new response
 * @param {Object} request - The request
 * @param {Object} response - The response
 * @param {string} command - The shell command to execute
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function shellTransform (request, response, command, logger) {
    return execShell(command, request, response, logger);
}

/**
 * Runs the response through a post-processing function provided by the user
 * @param {Object} originalRequest - The request object, in case post-processing depends on it
 * @param {Object} response - The response
 * @param {Function} fn - The function that performs the post-processing
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @param {Object} imposterState - The user controlled state variable
 * @returns {Object}
 */
function decorate (originalRequest, response, fn, logger, imposterState) {
    const config = {
            request: helpers.clone(originalRequest),
            response,
            logger,
            state: imposterState
        },
        injected = `(${fn})(config, response, logger);`; // backwards compatibility

    compatibility.downcastInjectionConfig(config);

    try {
        // Support functions that mutate response in place and those
        // that return a new response
        let result = eval(injected);
        if (!result) {
            result = response;
        }
        return Promise.resolve(result);
    }
    catch (error) {
        logger.error('injection X=> ' + error);
        logger.error('    full source: ' + JSON.stringify(injected));
        logger.error('    config: ' + JSON.stringify(config));
        return Promise.reject(exceptions.InjectionError('invalid decorator injection', { source: injected, data: error.message }));
    }
}

function getKeyIgnoringCase (obj, expectedKey) {
    return Object.keys(obj).find(key => {
        if (key.toLowerCase() === expectedKey.toLowerCase()) {
            return key;
        }
        else {
            return undefined;
        }
    });
}

function getFrom (obj, from) {
    const isObject = helpers.isObject;

    if (typeof obj === 'undefined') {
        return undefined;
    }
    else if (isObject(from)) {
        const keys = Object.keys(from);
        return getFrom(obj[keys[0]], from[keys[0]]);
    }
    else {
        const result = obj[getKeyIgnoringCase(obj, from)];

        // Some request fields, like query parameters, can be multi-valued
        if (Array.isArray(result)) {
            return result[0];
        }
        else {
            return result;
        }
    }
}

function regexFlags (options) {
    let result = '';
    if (options && options.ignoreCase) {
        result += 'i';
    }
    if (options && options.multiline) {
        result += 'm';
    }
    return result;
}

function getMatches (selectionFn, selector, logger) {
    const matches = selectionFn();

    if (matches && matches.length > 0) {
        return matches;
    }
    else {
        logger.debug('No match for "%s"', selector);
        return [];
    }
}

function regexValue (from, config, logger) {
    const regex = new RegExp(config.using.selector, regexFlags(config.using.options)),
        selectionFn = () => regex.exec(from);

    if (!safeRegex(regex)) {
        logger.warn(`If mountebank becomes unresponsive, it is because of this unsafe regular expression: ${config.using.selector}`);
    }
    return getMatches(selectionFn, regex, logger);
}

function xpathValue (from, config, logger) {
    const selectionFn = () => {
        return xPath.select(config.using.selector, config.using.ns, from, logger);
    };
    return getMatches(selectionFn, config.using.selector, logger);
}

function jsonpathValue (from, config, logger) {
    const selectionFn = () => {
        return jsonPath.select(config.using.selector, from, logger);
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
    const isObject = helpers.isObject,
        renames = {};

    Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'string') {
            obj[key] = replacer(obj[key]);
        }
        else if (isObject(obj[key])) {
            globalObjectReplace(obj[key], replacer);
        }
        var newKey = replacer(key);
        if (newKey !== key) {
            renames[key] = newKey;
        }
    });
    Object.keys(renames).forEach(key => {
        obj[renames[key]] = obj[key];
        delete obj[key];
    });
}

function replaceArrayValuesIn (response, token, values, logger) {
    const replacer = field => {
        values.forEach(function (replacement, index) {
            // replace ${TOKEN}[1] with indexed element
            const indexedToken = `${token}[${index}]`;
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
 * @param {Object} response - The response
 * @param {Function} copyConfig - The config to copy
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function copy (originalRequest, response, copyConfig, logger) {
    const from = getFrom(originalRequest, copyConfig.from),
        using = copyConfig.using || {},
        fnMap = { regex: regexValue, xpath: xpathValue, jsonpath: jsonpathValue },
        values = fnMap[using.method](from, copyConfig, logger);

    replaceArrayValuesIn(response, copyConfig.into, values, logger);
    return response;
}

function containsKey (headers, keyColumn) {
    const key = Object.values(headers).find(value => value === keyColumn);

    return helpers.defined(key);
}

function createRowObject (headers, rowArray) {
    const row = {};
    rowArray.forEach(function (value, index) {
        row[headers[index]] = value;
    });
    return row;
}

function selectRowFromCSV (csvConfig, keyValue, logger) {
    const delimiter = csvConfig.delimiter || ',',
        inputStream = fsExtra.createReadStream(csvConfig.path),
        parser = csvParse.parse({ delimiter: delimiter }),
        pipe = inputStream.pipe(parser);
    let headers;

    return new Promise(resolve => {
        inputStream.on('error', e => {
            logger.error('Cannot read ' + csvConfig.path + ': ' + e);
            resolve({});
        });

        pipe.on('data', function (rowArray) {
            if (!helpers.defined(headers)) {
                headers = rowArray;
                const keyOnHeader = containsKey(headers, csvConfig.keyColumn);
                if (!keyOnHeader) {
                    logger.error('CSV headers "' + headers + '" with delimiter "' + delimiter + '" does not contain keyColumn:"' + csvConfig.keyColumn + '"');
                    resolve({});
                }
            }
            else {
                const row = createRowObject(headers, rowArray);
                if (helpers.defined(row[csvConfig.keyColumn]) && row[csvConfig.keyColumn].localeCompare(keyValue) === 0) {
                    resolve(row);
                }
            }
        });

        pipe.on('error', e => {
            logger.debug('Error: ' + e);
            resolve({});
        });

        pipe.on('end', () => {
            resolve({});
        });
    });
}

function lookupRow (lookupConfig, originalRequest, logger) {
    const from = getFrom(originalRequest, lookupConfig.key.from),
        fnMap = { regex: regexValue, xpath: xpathValue, jsonpath: jsonpathValue },
        keyValues = fnMap[lookupConfig.key.using.method](from, lookupConfig.key, logger),
        index = lookupConfig.key.index || 0;

    if (lookupConfig.fromDataSource.csv) {
        return selectRowFromCSV(lookupConfig.fromDataSource.csv, keyValues[index], logger);
    }
    else {
        return Promise.resolve({});
    }
}

function replaceObjectValuesIn (response, token, values, logger) {
    const replacer = field => {
        Object.keys(values).forEach(key => {
            // replace ${TOKEN}["key"] and ${TOKEN}['key'] and ${TOKEN}[key]
            ['"', "'", ''].forEach(function (quoteChar) {
                const quoted = `${token}[${quoteChar}${key}${quoteChar}]`;
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
 * @param {Object} response - The response
 * @param {Function} lookupConfig - The lookup configurations
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
async function lookup (originalRequest, response, lookupConfig, logger) {
    try {
        const row = await lookupRow(lookupConfig, originalRequest, logger);
        replaceObjectValuesIn(response, lookupConfig.into, row, logger);
    }
    catch (error) {
        logger.error(error);
    }
    return response;
}

/**
 * The entry point to execute all behaviors provided in the API
 * @param {Object} request - The request object
 * @param {Object} response - The response generated from the stubs
 * @param {Object} behaviors - The behaviors specified in the API
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @param {Object} imposterState - the user-controlled state variable
 * @returns {Object}
 */
async function execute (request, response, behaviors, logger, imposterState) {
    const fnMap = {
        wait: wait,
        copy: copy,
        lookup: lookup,
        shellTransform: shellTransform,
        decorate: decorate
    };
    let result = Promise.resolve(response);

    if (!behaviors || behaviors.length === 0 || request.isDryRun) {
        return result;
    }

    logger.debug('using stub response behavior ' + JSON.stringify(behaviors));
    behaviors.forEach(behavior => {
        Object.keys(behavior).forEach(key => {
            if (fnMap[key]) {
                result = result.then(newResponse => fnMap[key](request, newResponse, behavior[key], logger, imposterState));
            }
        });
    });

    const observeBehaviorDuration = metrics.behaviorDuration.startTimer(),
        transformed = await result;
    observeBehaviorDuration({ imposter: logger.scopePrefix });
    return transformed;
}

module.exports = {
    validate,
    execute
};
