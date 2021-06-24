'use strict';

const assert = require('assert'),
    api = require('../../api').create(),
    BaseHttpClient = require('../../baseHttpClient'),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000);

['http', 'https'].forEach(protocol => {
    const client = BaseHttpClient.create(protocol);

    describe(`${protocol} imposter`, function () {
        this.timeout(timeout);

        afterEach(async function () {
            await api.del('/imposters');
        });

        describe('POST /imposters with stubs', function () {
            it('should drop the connection when fault CONNECTION_RESET_BY_PEER is specified', async function () {
                const stub = { responses: [{ fault: 'CONNECTION_RESET_BY_PEER' }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                try {
                    await client.get('/', port);
                    assert.fail('did not close socket');
                }
                catch (error) {
                    assert.strictEqual(error.code, 'ECONNRESET');
                }
            });

            it('should write garbage then drop the connection when fault RANDOM_DATA_THEN_CLOSE is specified', async function () {
                const stub = { responses: [{ fault: 'RANDOM_DATA_THEN_CLOSE' }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                try {
                    await client.get('/', port);
                    assert.fail('did not close socket');
                }
                catch (error) {
                    assert.strictEqual(error.code, 'HPE_INVALID_CONSTANT');
                }
            });

            it('should do nothing when undefined fault is specified', async function () {
                const stub = { responses: [{ fault: 'NON_EXISTENT_FAULT' }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);
                const response = await client.get('/', port);
                assert.strictEqual(response.statusCode, 200);
                assert.strictEqual(response.body, '');
            });

        });
    });
});
