'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    isWindows = require('os').platform().indexOf('win') === 0,
    promiseIt = require('../testHelpers').promiseIt,
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    BaseHttpClient = require('../api/http/baseHttpClient'),
    http = BaseHttpClient.create('http');

describe('--datadir', function () {
    this.timeout(timeout);

    promiseIt('should load previously saved imposters until they are deleted', function () {
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

        return mb.start(['--datadir', '.mbtest'])
            .then(() => mb.post('/imposters', imposter))
            .then(() => http.get('/', imposter.port))
            .then(response => {
                assert.strictEqual(response.body, 'first');
                return mb.stop();
            }).then(() => mb.start(['--datadir', '.mbtest']))
            .then(() => http.get('/', imposter.port))
            .then(response => {
                assert.strictEqual(response.body, 'second');
                return mb.del('/imposters');
            }).then(() => mb.stop())
            .then(() => mb.start(['--datadir', '.mbtest']))
            .then(() => {
                return http.get('/', imposter.port)
                    .then(() => {
                        assert.fail('should not have started previously deleted imposter');
                    }).catch(error => {
                        assert.strictEqual('ECONNREFUSED', error.code);
                    });
            }).finally(() => mb.stop());
    });

    promiseIt('should allow configfile to overwrite imposters loaded from datadir', function () {
        const imposter = {
                port: 4545,
                protocol: 'http',
                stubs: [{ responses: [{ is: { body: 'SHOULD BE OVERWRITTEN' } }] }]
            },
            path = require('path');

        return mb.start(['--datadir', '.mbtest'])
            .then(() => mb.post('/imposters', imposter))
            .then(() => http.get('/orders/123', 4545))
            .then(response => {
                assert.strictEqual(response.body, 'SHOULD BE OVERWRITTEN');
                return mb.stop();
            }).then(() => mb.start(['--datadir', '.mbtest', '--configfile', path.join(__dirname, 'imposters/imposters.ejs')]))
            .then(() => http.get('/orders/123', 4545))
            .then(response => {
                assert.strictEqual(response.body, 'Order 123');
                return mb.del('/imposters');
            }).finally(() => mb.stop());
    });

    promiseIt('should not delete files outside of imposter directories when deleting imposter', function () {
        const imposter = {
                port: 5555,
                protocol: 'http',
                stubs: [{ responses: [{ is: { body: 'BODY' } }] }]
            },
            fs = require('fs-extra');

        fs.ensureDirSync('.mbtest/5555');
        fs.writeFileSync('.mbtest/5555/INSIDE-IMPOSTER-DIR.txt', '');
        fs.ensureDirSync('.mbtest/meta');
        fs.writeFileSync('.mbtest/meta/OUTSIDE-IMPOSTER-DIR.txt', '');

        return mb.start(['--datadir', '.mbtest'])
            .then(() => mb.post('/imposters', imposter))
            .then(() => http.get('/', imposter.port))
            .then(response => {
                assert.strictEqual(response.body, 'BODY');
                return mb.del('/imposters');
            }).then(() => {
                assert.strictEqual(fs.existsSync('.mbtest/meta/OUTSIDE-IMPOSTER-DIR.txt'), true);
                assert.strictEqual(fs.existsSync('.mbtest/5555/INSIDE-IMPOSTER-DIR.txt'), false);
                fs.removeSync('.mbtest');
            }).finally(() => mb.stop());
    });
});
