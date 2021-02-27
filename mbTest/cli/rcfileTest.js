'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    isWindows = require('os').platform().indexOf('win') === 0,
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    fs = require('fs-extra');

describe('--rcfile', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await mb.stop();
    });

    it('should still start if rcfile does not exist', async function () {
        await mb.start(['--rcfile', 'mbrc.json']);

        const response = await mb.get('/config');

        assert.strictEqual(200, response.statusCode);
    });

    it('should still start if rcfile is not JSON', async function () {
        await mb.start(['--rcfile', 'mbrc.json']);
        fs.writeFileSync('mbrc.json', 'mock: true');

        try {
            const response = await mb.get('/config');

            assert.strictEqual(200, response.statusCode);
            assert.strictEqual(false, response.body.options.mock);
        }
        finally {
            fs.unlinkSync('mbrc.json');
        }
    });

    it('should load rcfile options and override defaults', async function () {
        fs.writeFileSync('mbrc.json', JSON.stringify({ mock: true }));

        try {
            await mb.start(['--rcfile', 'mbrc.json']);

            const response = await mb.get('/config');

            assert.strictEqual(200, response.statusCode);
            assert.strictEqual(true, response.body.options.mock);
        }
        finally {
            fs.unlinkSync('mbrc.json');
        }
    });

    it('options passed on CLI should override rcfile options', async function () {
        fs.writeFileSync('mbrc.json', JSON.stringify({
            mock: false,
            debug: true
        }));

        try {
            await mb.start(['--rcfile', 'mbrc.json', '--mock']);

            const response = await mb.get('/config');

            assert.strictEqual(200, response.statusCode);
            assert.strictEqual(true, response.body.options.mock);
            assert.strictEqual(true, response.body.options.debug);
        }
        finally {
            fs.unlinkSync('mbrc.json');
        }
    });

    it('options passed on CLI using an alias should override rcfile options', async function () {
        fs.writeFileSync('mbrc.json', JSON.stringify({ mock: true, debug: false }));

        try {
            await mb.start(['--rcfile', 'mbrc.json', '-d']);

            const response = await mb.get('/config');

            assert.strictEqual(200, response.statusCode);
            assert.strictEqual(true, response.body.options.mock);
            assert.strictEqual(true, response.body.options.debug);
        }
        finally {
            fs.unlinkSync('mbrc.json');
        }
    });
});
