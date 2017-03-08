'use strict';

var assert = require('assert'),
    promiseIt = require('../../testHelpers').promiseIt,
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger');

describe('behaviors', function () {
    describe('#wait', function () {
        promiseIt('should not execute during dry run', function () {
            var request = { isDryRun: true },
                response = { key: 'value' },
                logger = Logger.create(),
                start = new Date(),
                config = { wait: 1000 };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time < 50, 'Took ' + time + ' milliseconds');
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });

        promiseIt('should wait specified number of milliseconds', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                start = new Date(),
                config = { wait: 100 };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time > 90, 'Took ' + time + ' milliseconds'); // allows for approximate timing
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });

        promiseIt('should allow function to specify latency', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                fn = function () { return 100; },
                start = new Date(),
                config = { wait: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time > 90, 'Took ' + time + ' milliseconds'); // allows for approximate timing
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });

        promiseIt('should log error and reject function if function throws error', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                fn = function () { throw Error('BOOM!!!'); },
                config = { wait: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function () {
                assert.fail('should have rejected');
            }, function (error) {
                assert.ok(error.message.indexOf('invalid wait injection') >= 0);
                logger.error.assertLogged(fn.toString());
            });
        });

        promiseIt('should treat a string as milliseconds if it can be parsed as a number', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                start = new Date(),
                config = { wait: '100' };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                var time = new Date() - start;
                assert.ok(time > 90, 'Took ' + time + ' milliseconds'); // allows for approximate timing
                assert.deepEqual(actualResponse, { key: 'value' });
            });
        });

        it('should not be valid if below zero', function () {
            var errors = behaviors.validate({ wait: -1 });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'wait behavior "wait" field must be an integer greater than or equal to 0',
                source: { wait: -1 }
            }]);
        });

        it('should be valid if a string is passed in for the function', function () {
            var errors = behaviors.validate({ wait: 'function () {}' });
            assert.deepEqual(errors, []);
        });

        it('should not be valid if a boolean is passed in', function () {
            var errors = behaviors.validate({ wait: true });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'wait behavior "wait" field must be a string or a number',
                source: { wait: true }
            }]);
        });
    });
});
