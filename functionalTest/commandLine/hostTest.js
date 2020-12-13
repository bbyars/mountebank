'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    promiseIt = require('../testHelpers').promiseIt,
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = 2 * baseTimeout,
    hostname = require('os').hostname(),
    BaseHttpClient = require('../api/http/baseHttpClient'),
    http = BaseHttpClient.create('http'),
    fs = require('fs'),
    path = require('path');

describe('--host', function () {
    this.timeout(timeout);

    promiseIt('should allow binding to specific host', function () {
        return mb.start(['--host', hostname])
            .then(() => mb.get('/'))
            .then(response => {
                const links = response.body._links,
                    hrefs = Object.keys(links).map(key => links[key].href);
                assert.ok(hrefs.length > 0, 'no hrefs to test');
                hrefs.forEach(href => {
                    assert.ok(href.indexOf(`http://${hostname}`) === 0, `${href} does not use hostname`);
                });
            })
            .finally(() => mb.stop());
    });

    promiseIt('should work with --configfile', function () {
        const args = ['--host', hostname, '--configfile', path.join(__dirname, 'noparse.json'), '--noParse'];

        return mb.start(args)
            .then(() => http.responseFor({ method: 'GET', path: '/', hostname, port: 4545 }))
            .then(response => {
                assert.strictEqual(response.body, '<% should not render through ejs');
            })
            .finally(() => mb.stop());
    });

    promiseIt('should work with mb save', function () {
        const imposters = { imposters: [{ protocol: 'http', port: 3000, recordRequests: false, stubs: [] }] };

        return mb.start(['--host', hostname])
            .then(() => mb.put('/imposters', imposters))
            .then(response => {
                assert.strictEqual(response.statusCode, 200);
                return mb.save(['--host', hostname]);
            })
            .then(() => {
                assert.ok(fs.existsSync('mb.json'));
                assert.deepEqual(JSON.parse(fs.readFileSync('mb.json')), imposters);
                fs.unlinkSync('mb.json');
            })
            .finally(() => mb.stop());
    });

    promiseIt('should work with mb replay', function () {
        const originServerPort = mb.port + 1,
            originServerStub = { responses: [{ is: { body: 'ORIGIN' } }] },
            originServerRequest = { protocol: 'http', port: originServerPort, stubs: [originServerStub] },
            proxyPort = mb.port + 2,
            proxyDefinition = { to: `http://${hostname}:${originServerPort}`, mode: 'proxyAlways' },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub] };

        return mb.start(['--host', hostname])
            .then(() => mb.put('/imposters', { imposters: [originServerRequest, proxyRequest] }))
            .then(response => {
                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));
                return http.responseFor({ method: 'GET', path: '/', hostname, port: proxyPort });
            })
            .then(() => mb.replay(['--host', hostname]))
            .then(() => mb.get('/imposters?replayable=true'))
            .then(response => {
                const imposters = response.body.imposters,
                    oldProxyImposter = imposters.find(imposter => imposter.port === proxyPort),
                    responses = oldProxyImposter.stubs[0].responses;
                assert.strictEqual(responses.length, 1);
                assert.strictEqual(responses[0].is.body, 'ORIGIN');
            })
            .finally(() => mb.stop());
    });

    // Travis adds hostname into /etc/hosts file
    if (process.env.TRAVIS !== 'true') {
        promiseIt('should disallow localhost calls when bound to specific host', function () {
            return mb.start(['--host', hostname])
                .then(() => http.responseFor({ method: 'GET', path: '/', hostname: 'localhost', port: mb.port }))
                .then(
                    () => { assert.fail(`should not have connected (hostname: ${hostname})`); },
                    error => { assert.strictEqual(error.code, 'ECONNREFUSED'); })
                .finally(() => mb.stop());
        });

        promiseIt('should bind http imposter to provided host', function () {
            const imposter = { protocol: 'http', port: mb.port + 1 };

            return mb.start(['--host', hostname])
                .then(() => mb.post('/imposters', imposter))
                .then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return http.responseFor({
                        method: 'GET',
                        path: '/',
                        hostname: hostname,
                        port: imposter.port
                    });
                })
                .then(response => {
                    assert.strictEqual(response.statusCode, 200);

                    return http.responseFor({
                        method: 'GET',
                        path: '/',
                        hostname: 'localhost',
                        port: imposter.port
                    });
                })
                .then(
                    () => {
                        assert.fail('should not have connected to localhost');
                    },
                    error => {
                        assert.strictEqual(error.code, 'ECONNREFUSED');
                    }
                )
                .finally(() => mb.stop());
        });

        promiseIt('should bind tcp imposter to provided host', function () {
            const imposter = {
                    protocol: 'tcp',
                    port: mb.port + 1,
                    stubs: [{ responses: [{ is: { data: 'OK' } }] }]
                },
                client = require('../api/tcp/tcpClient');

            return mb.start(['--host', hostname])
                .then(() => mb.post('/imposters', imposter))
                .then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.send('TEST', imposter.port, 0, hostname);
                })
                .then(response => {
                    assert.strictEqual(response.toString(), 'OK');
                    return client.send('TEST', imposter.port, 0, 'localhost');
                })
                .then(
                    () => { assert.fail('should not have connected to localhost'); },
                    error => { assert.strictEqual(error.code, 'ECONNREFUSED'); }
                )
                .finally(() => mb.stop());
        });

        promiseIt('should bind smtp imposter to provided host', function () {
            const imposter = { protocol: 'smtp', port: mb.port + 1 },
                message = { from: '"From" <from@mb.org>', to: ['"To" <to@mb.org>'], subject: 'subject', text: 'text' },
                client = require('../api/smtp/smtpClient');

            return mb.start(['--host', hostname])
                .then(() => mb.post('/imposters', imposter))
                .then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.send(message, imposter.port, hostname);
                })
                .then(() => client.send(message, imposter.port, 'localhost'))
                .then(
                    () => { assert.fail('should not have connected to localhost'); },
                    // ESOCKET in node v14, ECONNREFUSED before
                    error => { assert.ok(['ECONNREFUSED', 'ESOCKET'].indexOf(error.code) >= 0); }
                )
                .finally(() => mb.stop());
        });
    }
});
