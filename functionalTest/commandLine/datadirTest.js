'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    isWindows = require('os').platform().indexOf('win') === 0,
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 5000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    BaseHttpClient = require('../api/http/baseHttpClient'),
    http = BaseHttpClient.create('http');

describe('--datadir', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await mb.stop();
    });

    it('should load previously saved imposters until they are deleted', async function () {
        const imposter = {
            port: mb.port + 1,
            protocol: 'http',
            stubs: [{
                responses: [
                    { is: { body: 'first' } },
                    { is: { body: 'second' } }
                ]
            }]
        };
        await mb.start(['--datadir', '.mbtest']);
        await mb.post('/imposters', imposter);

        const first = await http.get('/', imposter.port);
        assert.strictEqual(first.body, 'first');

        await mb.stop();
        await mb.start(['--datadir', '.mbtest']);

        const second = await http.get('/', imposter.port);
        assert.strictEqual(second.body, 'second');

        await mb.del('/imposters');
        await mb.stop();
        await mb.start(['--datadir', '.mbtest']);

        try {
            await http.get('/', imposter.port);
            assert.fail('should not have started previously deleted imposter');
        }
        catch (error) {
            assert.strictEqual('ECONNREFUSED', error.code);

        }
    });

    it('should allow configfile to overwrite imposters loaded from datadir', async function () {
        const imposter = {
                port: 4545,
                protocol: 'http',
                stubs: [{ responses: [{ is: { body: 'SHOULD BE OVERWRITTEN' } }] }]
            },
            path = require('path');
        await mb.start(['--datadir', '.mbtest']);
        await mb.post('/imposters', imposter);

        const first = await http.get('/orders/123', 4545);
        assert.strictEqual(first.body, 'SHOULD BE OVERWRITTEN');

        await mb.stop();
        await mb.start(['--datadir', '.mbtest', '--configfile', path.join(__dirname, 'imposters/imposters.ejs')]);

        const second = await http.get('/orders/123', 4545);
        assert.strictEqual(second.body, 'Order 123');

        await mb.del('/imposters');
    });

    it('should not delete files outside of imposter directories when deleting imposter', async function () {
        const imposter = {
                port: 5555,
                protocol: 'http',
                stubs: [{ responses: [{ is: { body: 'BODY' } }] }]
            },
            fs = require('fs-extra');
        await mb.start(['--datadir', '.mbtest']);
        fs.ensureDirSync('.mbtest/5555');
        fs.writeFileSync('.mbtest/5555/INSIDE-IMPOSTER-DIR.txt', '');
        fs.ensureDirSync('.mbtest/meta');
        fs.writeFileSync('.mbtest/meta/OUTSIDE-IMPOSTER-DIR.txt', '');

        try {
            await mb.post('/imposters', imposter);

            const response = await http.get('/', imposter.port);
            assert.strictEqual(response.body, 'BODY');

            await mb.del('/imposters');
            assert.strictEqual(fs.existsSync('.mbtest/meta/OUTSIDE-IMPOSTER-DIR.txt'), true);
            assert.strictEqual(fs.existsSync('.mbtest/5555/INSIDE-IMPOSTER-DIR.txt'), false);
        }
        finally {
            fs.removeSync('.mbtest');
        }
    });
});
