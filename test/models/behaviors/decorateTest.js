'use strict';

const assert = require('assert'),
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger');

describe('behaviors', function () {
    describe('#decorate', function () {
        it('should allow changing the response directly', async function () {
            const request = {},
                response = { key: 'ORIGINAL' },
                logger = Logger.create(),
                fn = (req, responseToDecorate) => { responseToDecorate.key = 'CHANGED'; },
                config = { decorate: fn.toString() },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { key: 'CHANGED' });
        });

        it('should allow returning response', async function () {
            const request = {},
                response = { key: 'VALUE' },
                logger = Logger.create(),
                fn = () => ({ newKey: 'NEW-VALUE' }),
                config = { decorate: fn.toString() },
                actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { newKey: 'NEW-VALUE' });
        });

        it('should allow logging in the decoration function', async function () {
            const request = {},
                response = { key: 'VALUE' },
                logger = Logger.create(),
                fn = (req, resp, log) => { log.info('test entry'); },
                config = { decorate: fn.toString() };

            await behaviors.execute(request, response, [config], logger);
            logger.info.assertLogged('test entry');
        });

        it('should log error and reject function if function throws error', async function () {
            const request = {},
                response = { key: 'value' },
                logger = Logger.create(),
                fn = () => { throw Error('BOOM!!!'); },
                config = { decorate: fn.toString() };

            try {
                await behaviors.execute(request, response, [config], logger);
                assert.fail('should have rejected');
            }
            catch (error) {
                assert.ok(error.message.indexOf('invalid decorator injection') >= 0);
                logger.error.assertLogged(fn.toString());
            }
        });

        it('should not be valid if not a string', function () {
            const errors = behaviors.validate([{ decorate: {} }]);
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'decorate behavior "decorate" field must be a string, representing a JavaScript function',
                source: { decorate: {} }
            }]);
        });

        it('should allow access to the imposter state', async function () {
            const request = {},
                response = {},
                state = {},
                logger = Logger.create(),
                fn = config => {
                    if (!config.state.hits) {
                        config.state.hits = 0;
                    }
                    config.state.hits += 1;
                    return { hits: config.state.hits };
                },
                behavior = { decorate: fn.toString() },
                firstResponse = await behaviors.execute(request, response, [behavior], logger, state),
                secondResponse = await behaviors.execute(request, firstResponse, [behavior], logger, state);

            assert.deepEqual(firstResponse, { hits: 1 });
            assert.deepEqual(secondResponse, { hits: 2 });
        });
    });
});
