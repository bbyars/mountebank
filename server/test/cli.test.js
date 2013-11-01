'use strict';

var testCase = require('nodeunit').testCase,
    cli = require('../src/cli'),
// test.throws behaves differently for reasons that I don't understand
    assert = require('assert');

require('./assertions');

exports.cli = testCase({

    'should parse command': function (test) {
        var result = cli.parse(['command']);

        test.strictEqual(result.command, 'command');
        test.done();
    },

    'should default to start if missing command': function (test) {
        var result = cli.parse([]);

        test.strictEqual(result.command, 'start');
        test.done();
    },

    'should return defaultOptions if no options provided': function (test) {
        var defaultOptions = { key: 'value' },
            result = cli.parse(['command'], defaultOptions);

        test.jsonEquals(result.options, defaultOptions);
        test.done();
    },

    'should throw if invalid option prefix': function (test) {
        var defaultOptions = { key: 'value' },
            parseWithInvalidOptionPrefix = function () {
                cli.parse(['command', 'key', '1'], defaultOptions);
            };

        assert.throws(parseWithInvalidOptionPrefix, /Invalid option 'key'/);
        test.done();
    },

    'should not accept options outside of defaultOptions': function (test) {
        var defaultOptions = { key: 'value' },
            parseWithInvalidOption = function () {
                cli.parse(['command', '--invalid', 'option'], defaultOptions);
            };

        assert.throws(parseWithInvalidOption, /Option 'invalid' not recognized/);
        test.done();
    },

    'should throw if no argument provided for option': function (test) {
        var defaultOptions = { key: 'value' },
            parseWithNoArgument = function () {
                cli.parse(['command', '--key'], defaultOptions);
            };

        assert.throws(parseWithNoArgument, /No argument provided for option 'key'/);
        test.done();
    },

    'should overwrite option if provided': function (test) {
        var defaultOptions = { key: 'value' },
            result = cli.parse(['command', '--key', 'changed'], defaultOptions);

        test.jsonEquals(result.options, { key: 'changed' });
        test.done();
    },

    'should maintain unchanged options': function (test) {
        var defaultOptions = { first: 'one', second: 'two' },
            result = cli.parse(['command', '--first', 'changed'], defaultOptions);

        test.jsonEquals(result.options, { first: 'changed', second: 'two' });
        test.done();
    }

});
