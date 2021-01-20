'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    path = require('path'),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('../api/http/baseHttpClient'),
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    http = BaseHttpClient.create('http'),
    fs = require('fs');

describe('mb save', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await mb.stop();
    });

    it('should allow saving replayable format', async function () {
        const args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')];
        await mb.start(args);

        const response = await mb.get('/imposters?replayable=true'),
            expected = response.body;

        await mb.save();

        try {
            assert.ok(fs.existsSync('mb.json'));
            assert.deepEqual(expected, JSON.parse(fs.readFileSync('mb.json')));
        }
        finally {
            fs.unlinkSync('mb.json');
        }
    });

    it('should allow saving to a different config file', async function () {
        const args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')];
        await mb.start(args);

        const response = await mb.get('/imposters?replayable=true'),
            expected = response.body;

        await mb.save(['--savefile', 'saved.json']);

        try {
            assert.ok(fs.existsSync('saved.json'));
            assert.deepEqual(expected, JSON.parse(fs.readFileSync('saved.json')));
        }
        finally {
            fs.unlinkSync('saved.json');
        }
    });

    if (process.env.MB_AIRPLANE_MODE !== 'true') {
        it('should allow removing proxies during save', async function () {
            const proxyStub = { responses: [{ proxy: { to: 'https://google.com' } }] },
                proxyRequest = { protocol: 'http', port: port + 1, stubs: [proxyStub], name: 'PROXY' };
            await mb.start();
            await mb.post('/imposters', proxyRequest);

            await http.get('/', port + 1);
            const response = await mb.get('/imposters?replayable=true&removeProxies=true'),
                expected = response.body,
                result = await mb.save(['--removeProxies']);

            try {
                assert.strictEqual(result.exitCode, 0);
                assert.ok(fs.existsSync('mb.json'));
                assert.deepEqual(expected, JSON.parse(fs.readFileSync('mb.json')));
            }
            finally {
                fs.unlinkSync('mb.json');
            }
        });
    }
});
