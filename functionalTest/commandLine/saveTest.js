'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    path = require('path'),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('../api/http/baseHttpClient'),
    promiseIt = require('../testHelpers').promiseIt,
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    http = BaseHttpClient.create('http'),
    fs = require('fs');

describe('mb save', function () {
    this.timeout(timeout);

    promiseIt('should allow saving replayable format', function () {
        const args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')];
        let expected;

        return mb.start(args)
            .then(() => mb.get('/imposters?replayable=true'))
            .then(response => {
                expected = response.body;
                return mb.save();
            })
            .then(() => {
                assert.ok(fs.existsSync('mb.json'));
                assert.deepEqual(expected, JSON.parse(fs.readFileSync('mb.json')));
                fs.unlinkSync('mb.json');
            })
            .finally(() => mb.stop());
    });

    promiseIt('should allow saving to a different config file', function () {
        const args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')];
        let expected;

        return mb.start(args)
            .then(() => mb.get('/imposters?replayable=true'))
            .then(response => {
                expected = response.body;
                return mb.save(['--savefile', 'saved.json']);
            })
            .then(() => {
                assert.ok(fs.existsSync('saved.json'));
                assert.deepEqual(expected, JSON.parse(fs.readFileSync('saved.json')));
                fs.unlinkSync('saved.json');
            })
            .finally(() => mb.stop());
    });

    if (process.env.MB_AIRPLANE_MODE !== 'true') {
        promiseIt('should allow removing proxies during save', function () {
            const proxyStub = { responses: [{ proxy: { to: 'https://google.com' } }] },
                proxyRequest = { protocol: 'http', port: port + 1, stubs: [proxyStub], name: 'PROXY' };
            let expected;

            return mb.start()
                .then(() => mb.post('/imposters', proxyRequest))
                .then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 4));
                    return http.get('/', port + 1);
                })
                .then(() => mb.get('/imposters?replayable=true&removeProxies=true'))
                .then(response => {
                    expected = response.body;
                    return mb.save(['--removeProxies']);
                })
                .then(result => {
                    assert.strictEqual(result.exitCode, 0);
                    assert.ok(fs.existsSync('mb.json'));
                    assert.deepEqual(expected, JSON.parse(fs.readFileSync('mb.json')));
                    fs.unlinkSync('mb.json');
                })
                .finally(() => mb.stop());
        });
    }
});
