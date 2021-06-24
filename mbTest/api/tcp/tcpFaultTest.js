'use strict';

const assert = require('assert'),
    api = require('../../api').create(),
    port = api.port + 1,
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = isWindows ? 10000 : parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    tcp = require('./tcpClient');

describe('tcp imposter', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await api.del('/imposters');
    });

    describe('POST /imposters with stubs', function () {
        it.skip('should drop the connection when fault CONNECTION_RESET_BY_PEER is specified', async function () {
            const stub = { responses: [{fault: "CONNECTION_RESET_BY_PEER" }] },
                request = { protocol: 'tcp', port, stubs: [stub], mode: 'text' };
            await api.createImposter(request);

            try {
                await tcp.send('client', port);
                assert.fail('did not close socket');
            }
            catch (error) {
                assert.strictEqual(error.code, 'ECONNRESET');
            }
        });

        it.skip('should write garbage then drop the connection when fault RANDOM_DATA_THEN_CLOSE is specified', async function () {
            const stub = { responses: [{fault: "RANDOM_DATA_THEN_CLOSE" }] },
                request = { protocol: 'tcp', port, stubs: [stub], mode: 'text' };
            await api.createImposter(request);

            try {
                await tcp.send('client', port);
                assert.fail('did not close socket');
            }
            catch (error) {
                assert.strictEqual(error.code, 'ECONNRESET');
            }
        });

        it.skip('should do nothing when undefined fault is specified', async function () {
            const stub = { responses: [{fault: "NON_EXISTENT_FAULT" }] },
                request = { protocol: 'tcp', port, stubs: [stub], mode: 'text' };
            await api.createImposter(request);
            const response = await tcp.send('client', port);
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.body, "");
        });

    });
});
