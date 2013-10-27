'use strict';

var parse = function (argv, defaultOptions) {
    function parseOption(key, value) {
        var OPTION_PREFIX = /^--/,
            optionName;

        if (key.match(OPTION_PREFIX) === null) {
            throw new Error("Invalid option '" + key + "'.");
        }
        optionName = key.replace(OPTION_PREFIX, '');

        if (!defaultOptions.hasOwnProperty(optionName)) {
            throw new Error("Option '" + optionName + "' not recognized.");
        }
        if (value === undefined) {
            throw new Error("No argument provided for option '" + optionName + "'.");
        }

        return {
            key: optionName,
            value: value
        };
    }

    function parseOptions() {
        var options = {},
            option,
            key,
            i;

        // Add custom options
        for (i = 1; i < argv.length; i += 2) {
            option = parseOption(argv[i], argv[i + 1]);
            options[option.key] = option.value;
        }

        // add default options
        for (key in defaultOptions) {
            if (defaultOptions.hasOwnProperty(key) && !options.hasOwnProperty(key)) {
                options[key] = defaultOptions[key];
            }
        }

        return options;
    }

    function parseCommand() {
        return argv[0] || 'start';
    }

    return {
        command: parseCommand(),
        options: parseOptions()
    };
};

module.exports = {
    parse: parse
};
