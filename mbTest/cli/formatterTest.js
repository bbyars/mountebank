'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('../baseHttpClient'),
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    http = BaseHttpClient.create('http'),
    fs = require('fs-extra');

describe('--formatter', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await mb.stop();
    });

    it('should allow using custom synchronous formatter', async function () {
        const imposter = {
                protocol: 'http',
                port: 3000,
                recordRequests: false,
                stubs: [{ responses: [{ is: { body: 'SUCCESS' } }] }]
            },
            formatter = `${__dirname}/formatters/base64Formatter`;
        await mb.start([]);
        await mb.post('/imposters', imposter);

        await mb.save(['--formatter', formatter]);

        try {
            const contents = fs.readFileSync('mb.json', { encoding: 'utf8' }),
                json = Buffer.from(contents, 'base64').toString('utf8');
            assert.deepStrictEqual(JSON.parse(json), { imposters: [imposter] });

            await mb.stop();
            await mb.start(['--configfile', 'mb.json', '--formatter', formatter]);

            const response = await http.get('/', 3000);
            assert.strictEqual(response.body, 'SUCCESS');
        }
        finally {
            fs.unlinkSync('mb.json');
        }
    });

    it('should allow using custom asynchronous formatter', async function () {
        const imposter = {
                protocol: 'http',
                port: 3000,
                recordRequests: false,
                stubs: [{ responses: [{ is: { body: 'SUCCESS' } }] }]
            },
            formatter = `${__dirname}/formatters/asyncBase64Formatter`;
        await mb.start([]);
        await mb.post('/imposters', imposter);

        await mb.save(['--formatter', formatter]);

        try {
            const contents = fs.readFileSync('mb.json', { encoding: 'utf8' }),
                json = Buffer.from(contents, 'base64').toString('utf8');
            assert.deepStrictEqual(JSON.parse(json), { imposters: [imposter] });

            await mb.stop();
            await mb.start(['--configfile', 'mb.json', '--formatter', formatter]);

            const response = await http.get('/', 3000);
            assert.strictEqual(response.body, 'SUCCESS');
        }
        finally {
            fs.unlinkSync('mb.json');
        }
    });

    it('should allow passing custom CLI options to formatter', async function () {
        const imposter = {
                protocol: 'http',
                port: 3000,
                recordRequests: false,
                stubs: [{ responses: [{ is: { body: 'SUCCESS' } }] }]
            },
            formatter = `${__dirname}/formatters/base64Formatter`;
        await mb.start([]);
        await mb.post('/imposters', imposter);

        await mb.save(['--formatter', formatter, '--customName', 'custom name']);

        try {
            const contents = fs.readFileSync('mb.json', { encoding: 'utf8' }),
                json = Buffer.from(contents, 'base64').toString('utf8');
            imposter.name = 'custom name';
            assert.deepStrictEqual(JSON.parse(json), { imposters: [imposter] });
        }
        finally {
            fs.unlinkSync('mb.json');
        }
    });
});
