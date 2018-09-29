'use strict';

const assert = require('assert'),
    promiseIt = require('../../testHelpers').promiseIt,
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger');

describe('behaviors', () => {
    describe('#decorate', () => {
        promiseIt('should allow changing the response directly', () => {
            const request = {},
                response = { key: 'ORIGINAL' },
                logger = Logger.create(),
                fn = function (req, responseToDecorate) { responseToDecorate.key = 'CHANGED'; },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { key: 'CHANGED' });
            });
        });

        promiseIt('should allow returning response', () => {
            const request = {},
                response = { key: 'VALUE' },
                logger = Logger.create(),
                fn = () => ({ newKey: 'NEW-VALUE' }),
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { newKey: 'NEW-VALUE' });
            });
        });

        promiseIt('should allow logging in the decoration function', () => {
            const request = {},
                response = { key: 'VALUE' },
                logger = Logger.create(),
                fn = function (req, resp, log) { log.info('test entry'); },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(() => {
                logger.info.assertLogged('test entry');
            });
        });

        promiseIt('should log error and reject function if function throws error', () => {
            const request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                fn = () => { throw Error('BOOM!!!'); },
                config = { decorate: fn.toString() };

            return behaviors.execute(request, response, config, logger).then(() => {
                assert.fail('should have rejected');
            }, function (error) {
                assert.ok(error.message.indexOf('invalid decorator injection') >= 0);
                logger.error.assertLogged(fn.toString());
            });
        });

        it('should not be valid if not a string', () => {
            const errors = behaviors.validate({ decorate: {} });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'decorate behavior "decorate" field must be a string, representing a JavaScript function',
                source: { decorate: {} }
            }]);
        });
    });
});
