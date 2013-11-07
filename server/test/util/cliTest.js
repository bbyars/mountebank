'use strict';

var cli = require('../../src/util/cli'),
    assert = require('assert');

describe('cli', function () {
    describe('#parse()', function () {
        it('should parse command', function () {
            var result = cli.parse(['command']).command;
            assert.strictEqual(result ,'command');
        });

        it('should default to start if missing command', function () {
            var result = cli.parse([]).command;
            assert.strictEqual(result, 'start');
        });

        it('should return defaultOptions if no options provided', function () {
            var defaultOptions = { key: 'value'},
                result = cli.parse(['command'], defaultOptions);

            assert.deepEqual(result.options, defaultOptions);
        });

        it('should throw if invalid option prefix', function () {
            var defaultOptions = { key: 'value' },
                parseWithInvalidOptionPrefix = function () {
                    cli.parse(['command', 'key', '1'], defaultOptions);
                };

            assert.throws(parseWithInvalidOptionPrefix, /Invalid option 'key'/);
        });

        it('should not accept options outside of defaultOptions', function () {
            var defaultOptions = { key: 'value' },
                parseWithInvalidOption = function () {
                    cli.parse(['command', '--invalid', 'option'], defaultOptions);
                };

            assert.throws(parseWithInvalidOption, /Option 'invalid' not recognized/);
        });

        it('should throw if no argument provided for option', function () {
            var defaultOptions = { key: 'value' },
                parseWithNoArgument = function () {
                    cli.parse(['command', '--key'], defaultOptions);
                };

            assert.throws(parseWithNoArgument, /No argument provided for option 'key'/);
        });

        it('should overwrite option if provided', function () {
            var defaultOptions = { key: 'value' },
                result = cli.parse(['command', '--key', 'changed'], defaultOptions);

            assert.deepEqual(result.options, { key: 'changed' });
        });

        it('should maintain unchanged options', function () {
            var defaultOptions = { first: 'one', second: 'two' },
                result = cli.parse(['command', '--first', 'changed'], defaultOptions);

            assert.deepEqual(result.options, { first: 'changed', second: 'two' });
        });
    });
});

