'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('../api/http/baseHttpClient'),
    promiseIt = require('../testHelpers').promiseIt,
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    http = BaseHttpClient.create('http'),
    fs = require('fs');

describe('--formatter', function () {
    this.timeout(timeout);

    promiseIt('should allow using custom synchronous formatter', function () {
        const imposter = {
                protocol: 'http',
                port: 3000,
                recordRequests: false,
                stubs: [{ responses: [{ is: { body: 'SUCCESS' } }] }]
            },
            formatter = `${__dirname}/formatters/base64Formatter`;

        return mb.start([])
            .then(() => mb.post('/imposters', imposter))
            .then(() => mb.save(['--formatter', formatter]))
            .then(() => {
                const contents = fs.readFileSync('mb.json', { encoding: 'utf8' }),
                    json = Buffer.from(contents, 'base64').toString('utf8');

                assert.deepStrictEqual(JSON.parse(json), { imposters: [imposter] });
                return mb.stop();
            })
            .then(() => mb.start(['--configfile', 'mb.json', '--formatter', formatter]))
            .then(() => http.get('/', 3000))
            .then(response => {
                assert.strictEqual(response.body, 'SUCCESS');
            })
            .finally(() => {
                fs.unlinkSync('mb.json');
                return mb.stop();
            });
    });

    promiseIt('should allow using custom asynchronous formatter', function () {
        const imposter = {
                protocol: 'http',
                port: 3000,
                recordRequests: false,
                stubs: [{ responses: [{ is: { body: 'SUCCESS' } }] }]
            },
            formatter = `${__dirname}/formatters/asyncBase64Formatter`;

        return mb.start([])
            .then(() => mb.post('/imposters', imposter))
            .then(() => mb.save(['--formatter', formatter]))
            .then(() => {
                const contents = fs.readFileSync('mb.json', { encoding: 'utf8' }),
                    json = Buffer.from(contents, 'base64').toString('utf8');

                assert.deepStrictEqual(JSON.parse(json), { imposters: [imposter] });
                return mb.stop();
            })
            .then(() => mb.start(['--configfile', 'mb.json', '--formatter', formatter]))
            .then(() => http.get('/', 3000))
            .then(response => {
                assert.strictEqual(response.body, 'SUCCESS');
            })
            .finally(() => {
                fs.unlinkSync('mb.json');
                return mb.stop();
            });
    });

    it('should allow passing custom CLI options to formatter', function () {
        const imposter = {
                protocol: 'http',
                port: 3000,
                recordRequests: false,
                stubs: [{ responses: [{ is: { body: 'SUCCESS' } }] }]
            },
            formatter = `${__dirname}/formatters/base64Formatter`;

        return mb.start([])
            .then(() => mb.post('/imposters', imposter))
            .then(() => mb.save(['--formatter', formatter, '--customName', 'custom name']))
            .then(() => {
                const contents = fs.readFileSync('mb.json', { encoding: 'utf8' }),
                    json = Buffer.from(contents, 'base64').toString('utf8');

                imposter.name = 'custom name';
                assert.deepStrictEqual(JSON.parse(json), { imposters: [imposter] });
                return mb.stop();
            })
            .finally(() => {
                fs.unlinkSync('mb.json');
                return mb.stop();
            });
    });
});
