'use strict';

/**
 * The module used to parse the command line arguments
 * @module
 */

/**
 * The function that parses command line arguments
 * @param {Object} argv - array of command line switches
 * @param {Object} defaultOptions - default options if a command line switch is missing
 * @param {Object} booleanOptions - array of boolean switches, all of which default to false if not passed
 * @returns {{command: string, options: *}}
 */
var parse = function (argv, defaultOptions, booleanOptions) {

    var OPTION_PREFIX = /^--/;
    defaultOptions = defaultOptions || {};
    booleanOptions = booleanOptions || [];

    function isSwitch (arg) {
        return OPTION_PREFIX.test(arg);
    }

    function isBoolean (arg) {
        return booleanOptions.indexOf(arg) >= 0;
    }

    function validate (key, optionName, value) {
        if (!isSwitch(key)) {
            throw Error("Invalid option '" + key + "'.");
        }

        if (typeof defaultOptions[optionName] === 'undefined' && !isBoolean(optionName)) {
            throw Error("Option '" + optionName + "' not recognized.");
        }

        if (defaultOptions[optionName] && !value) {
            throw Error("No argument provided for option '" + optionName + "'.");
        }
    }

    function baseOptions () {
        var result = defaultOptions;
        booleanOptions.forEach(function (key) {
            result[key] = false;
        });
        return result;
    }

    function parseOptions (options, i) {
        while (i < argv.length) {
            var key = argv[i],
                optionName = key.replace(OPTION_PREFIX, ''),
                value = argv[i + 1];

            validate(key, optionName, value);

            if (isBoolean(optionName)) {
                value = true;
                i += 1;
            }
            else {
                i += 2;
            }

            options[optionName] = value;
        }
    }

    var command = 'start',
        options = baseOptions(),
        i = 0;

    if (argv[0] && !isSwitch(argv[0])) {
        command = argv[0];
        i = 1;
    }

    parseOptions(options, i);

    return {
        command: command,
        options: options
    };
};

module.exports = {
    parse: parse
};
