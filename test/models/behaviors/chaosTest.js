'use strict';

const assert = require('node:assert'),
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger');

describe('behaviors', function () {
    describe('#chaos', function () {
        let originalRandom;

        beforeEach(function () {
            originalRandom = Math.random;
        });

        afterEach(function () {
            Math.random = originalRandom;
        });

        it('should not execute during dry run', async function () {
            Math.random = () => 0;
            const request = { isDryRun: true },
                response = { statusCode: 200, body: 'ok' },
                logger = Logger.create(),
                config = { chaos: { errorRate: 1, errorStatusCode: 503 } };
            const actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { statusCode: 200, body: 'ok' });
        });

        it('should pass response through unchanged when no probabilities are set', async function () {
            Math.random = () => 0;
            const request = {},
                response = { statusCode: 200, body: 'ok' },
                logger = Logger.create(),
                config = { chaos: {} };
            const actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { statusCode: 200, body: 'ok' });
        });

        it('should inject configured error status when errorRate triggers', async function () {
            Math.random = () => 0;
            const request = {},
                response = { statusCode: 200, body: 'ok' },
                logger = Logger.create(),
                config = { chaos: { errorRate: 1, errorStatusCode: 503 } };
            const actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.strictEqual(actualResponse.statusCode, 503);
            assert.strictEqual(actualResponse.body, '');
        });

        it('should default errorStatusCode to 500 when not provided', async function () {
            Math.random = () => 0;
            const request = {},
                response = { statusCode: 200, body: 'ok' },
                logger = Logger.create(),
                config = { chaos: { errorRate: 1 } };
            const actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.strictEqual(actualResponse.statusCode, 500);
            assert.strictEqual(actualResponse.body, '');
        });

        it('should not inject error when random draw is above errorRate', async function () {
            Math.random = () => 0.99;
            const request = {},
                response = { statusCode: 200, body: 'ok' },
                logger = Logger.create(),
                config = { chaos: { errorRate: 0.5, errorStatusCode: 503 } };
            const actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { statusCode: 200, body: 'ok' });
        });

        it('should not inject error when errorRate is 0', async function () {
            Math.random = () => 0.5;
            const request = {},
                response = { statusCode: 200, body: 'ok' },
                logger = Logger.create(),
                config = { chaos: { errorRate: 0, errorStatusCode: 503 } };
            const actualResponse = await behaviors.execute(request, response, [config], logger);

            assert.deepEqual(actualResponse, { statusCode: 200, body: 'ok' });
        });

        it('should inject latency when latencyRate triggers', async function () {
            let calls = 0;
            Math.random = () => {
                calls += 1;
                return calls === 1 ? 0 : 0.99;
            };
            const request = {},
                response = { statusCode: 200, body: 'ok' },
                logger = Logger.create(),
                start = Date.now(),
                config = { chaos: { latencyRate: 1, maxLatencyMs: 100 } };
            const actualResponse = await behaviors.execute(request, response, [config], logger);
            const elapsed = Date.now() - start;

            assert.ok(elapsed >= 90, `expected latency >=90ms, got ${elapsed}ms`);
            assert.deepEqual(actualResponse, { statusCode: 200, body: 'ok' });
        });

        it('should default maxLatencyMs to 1000 when not provided', async function () {
            let calls = 0;
            Math.random = () => {
                calls += 1;
                return calls === 1 ? 0 : 0.05;
            };
            const request = {},
                response = { statusCode: 200, body: 'ok' },
                logger = Logger.create(),
                start = Date.now(),
                config = { chaos: { latencyRate: 1 } };
            await behaviors.execute(request, response, [config], logger);
            const elapsed = Date.now() - start;

            assert.ok(elapsed >= 40, `expected latency >=40ms, got ${elapsed}ms`);
        });

        it('should skip latency when maxLatencyMs is 0', async function () {
            Math.random = () => 0.5;
            const request = {},
                response = { statusCode: 200, body: 'ok' },
                logger = Logger.create(),
                start = Date.now(),
                config = { chaos: { latencyRate: 1, maxLatencyMs: 0 } };
            await behaviors.execute(request, response, [config], logger);
            const elapsed = Date.now() - start;

            assert.ok(elapsed < 50, `expected near-instant, got ${elapsed}ms`);
        });

        it('should not be valid if errorRate is not a number', function () {
            const errors = behaviors.validate([{ chaos: { errorRate: 'oops' } }]);
            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0].code, 'bad data');
            assert.ok(errors[0].message.includes('errorRate'),
                `unexpected message: ${errors[0].message}`);
        });

        it('should not be valid if latencyRate is not a number', function () {
            const errors = behaviors.validate([{ chaos: { latencyRate: 'oops' } }]);
            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0].code, 'bad data');
            assert.ok(errors[0].message.includes('latencyRate'),
                `unexpected message: ${errors[0].message}`);
        });

        it('should not be valid if maxLatencyMs is negative', function () {
            const errors = behaviors.validate([{ chaos: { maxLatencyMs: -1 } }]);
            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0].code, 'bad data');
            assert.ok(errors[0].message.includes('maxLatencyMs'),
                `unexpected message: ${errors[0].message}`);
        });

        it('should not be valid if errorStatusCode is negative', function () {
            const errors = behaviors.validate([{ chaos: { errorStatusCode: -1 } }]);
            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0].code, 'bad data');
        });

        it('should be valid with all fields set to reasonable values', function () {
            const errors = behaviors.validate([{
                chaos: {
                    errorRate: 0.1,
                    errorStatusCode: 503,
                    latencyRate: 0.05,
                    maxLatencyMs: 1000
                }
            }]);
            assert.deepEqual(errors, []);
        });
    });
});
