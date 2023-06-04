'use strict';

const assert = require('assert'),
    port = 3000,
    mb = require('../../mb').create(port),
    api = require('../../api').create(mb.port),
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    BaseHttpClient = require('../../baseHttpClient');


describe('Metrics', function () {
    const protocol = 'http';
    const client = BaseHttpClient.create(protocol);
    this.timeout(timeout);

    describe('GET /metrics', function () {

        before(async function () {
            await mb.start();
        });

        after(async function () {
            await mb.stop();
        });

        afterEach(async function () {
            await api.del('/imposters');
        });

        it('should return imposter metrics only if a imposter exists', async function () {
            const response = await client.get('/metrics', api.port);

            assert.doesNotMatch(response.body, /mb_predicate_match_duration_seconds/);
            assert.doesNotMatch(response.body, /mb_no_match_total/);
            assert.doesNotMatch(response.body, /mb_response_generation_duration_seconds/);
            assert.doesNotMatch(response.body, /mb_blocked_ip_total/);
        });

        it('should return imposter metrics only if a imposter was called', async function () {
            const imposterPort = port + 1;
            const request = { protocol, port: imposterPort };
            await api.createImposter(request);

            const response = await client.get('/metrics', api.port);

            assert.doesNotMatch(response.body, /mb_predicate_match_duration_seconds.+{.+imposter.+}/);
            assert.doesNotMatch(response.body, /mb_no_match_total{.*imposter.+}/);
            assert.doesNotMatch(response.body, /mb_response_generation_duration_seconds.+{.+imposter.+}/);
        });

        it('should return imposter metrics after imposters calls', async function () {
            const imposterPort = port + 1;
            const request = { protocol, port: imposterPort };
            await api.createImposter(request);
            await client.get(api.url, imposterPort);

            const response = await client.get('/metrics', api.port);

            assert.match(response.body, /mb_predicate_match_duration_seconds.+{.+imposter.+}/);
            assert.match(response.body, /mb_no_match_total{.*imposter.+}/);
            assert.match(response.body, /mb_response_generation_duration_seconds.+{.+imposter.+}/);
        });
    });
});
