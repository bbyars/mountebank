'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    isWindows = require('os').platform().indexOf('win') === 0,
    promiseIt = require('../testHelpers').promiseIt,
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    fs = require('fs');

describe('--rcfile', function () {
    this.timeout(timeout);

    promiseIt('should still start if rcfile does not exist', function () {
        return mb.start(['--rcfile', 'mbrc.json'])
            .then(() => mb.get('/config'))
            .then(response => {
                assert.strictEqual(200, response.statusCode);
            })
            .finally(() => mb.stop());
    });

    promiseIt('should still start if rcfile is not JSON', function () {
        fs.writeFileSync('mbrc.json', 'mock: true');

        return mb.start(['--rcfile', 'mbrc.json'])
            .then(() => mb.get('/config'))
            .then(response => {
                assert.strictEqual(200, response.statusCode);
                assert.strictEqual(false, response.body.options.mock);
            })
            .finally(() => {
                fs.unlinkSync('mbrc.json');
                return mb.stop();
            });
    });

    promiseIt('should load rcfile options and override defaults', function () {
        fs.writeFileSync('mbrc.json', JSON.stringify({ mock: true }));

        return mb.start(['--rcfile', 'mbrc.json'])
            .then(() => mb.get('/config'))
            .then(response => {
                assert.strictEqual(200, response.statusCode);
                assert.strictEqual(true, response.body.options.mock);
            })
            .finally(() => {
                fs.unlinkSync('mbrc.json');
                return mb.stop();
            });
    });

    promiseIt('options passed on CLI should override rcfile options', function () {
        fs.writeFileSync('mbrc.json', JSON.stringify({
            mock: false,
            debug: true
        }));

        return mb.start(['--rcfile', 'mbrc.json', '--mock'])
            .then(() => mb.get('/config'))
            .then(response => {
                assert.strictEqual(200, response.statusCode);
                assert.strictEqual(true, response.body.options.mock);
                assert.strictEqual(true, response.body.options.debug);
            })
            .finally(() => {
                fs.unlinkSync('mbrc.json');
                return mb.stop();
            });
    });

    promiseIt('options passed on CLI using an alias should override rcfile options', function () {
        fs.writeFileSync('mbrc.json', JSON.stringify({ mock: true, debug: false }));

        return mb.start(['--rcfile', 'mbrc.json', '-d'])
            .then(() => mb.get('/config'))
            .then(response => {
                assert.strictEqual(200, response.statusCode);
                assert.strictEqual(true, response.body.options.mock);
                assert.strictEqual(true, response.body.options.debug);
            })
            .finally(() => {
                fs.unlinkSync('mbrc.json');
                return mb.stop();
            });
    });
});
