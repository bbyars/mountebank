'use strict';

var assert = require('assert'),
    promiseIt = require('../../testHelpers').promiseIt,
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger');

describe('behaviors', function () {
    describe('#decorate', function () {
        promiseIt('should allow changing the response directly', function () {
            var request = {},
                response = { key: 'ORIGINAL' },
                logger = Logger.create(),
                fn = function (req, responseToDecorate) { responseToDecorate.key = 'CHANGED'; },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { key: 'CHANGED' });
            });
        });

        promiseIt('should allow returning response', function () {
            var request = {},
                response = { key: 'VALUE' },
                logger = Logger.create(),
                fn = function () { return { newKey: 'NEW-VALUE' }; },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { newKey: 'NEW-VALUE' });
            });
        });

        promiseIt('should allow logging in the decoration function', function () {
            var request = {},
                response = { key: 'VALUE' },
                logger = Logger.create(),
                fn = function (req, resp, log) { log.info('test entry'); },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function () {
                logger.info.assertLogged('test entry');
            });
        });

        promiseIt('should log error and reject function if function throws error', function () {
            var request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                fn = function () { throw Error('BOOM!!!'); },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function () {
                assert.fail('should have rejected');
            }, function (error) {
                assert.ok(error.message.indexOf('invalid decorator injection') >= 0);
                logger.error.assertLogged(fn.toString());
            });
        });

        it('should not be valid if not a string', function () {
            var errors = behaviors.validate({ decorate: {} });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'decorate behavior "decorate" field must be a string, representing a JavaScript function',
                source: { decorate: {} }
            }]);
        });
    });
});
