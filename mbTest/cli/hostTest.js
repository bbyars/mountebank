'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = 2 * baseTimeout,
    hostname = require('os').hostname(),
    BaseHttpClient = require('../baseHttpClient'),
    http = BaseHttpClient.create('http'),
    fs = require('fs-extra'),
    path = require('path');

describe('--host', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await mb.stop();
    });

    it('should allow binding to specific host', async function () {
        await mb.start(['--host', hostname]);

        const response = await mb.get('/'),
            links = response.body._links,
            hrefs = Object.keys(links).map(key => links[key].href);

        assert.ok(hrefs.length > 0, 'no hrefs to test');
        hrefs.forEach(href => {
            assert.ok(href.indexOf(`http://${hostname}`) === 0, `${href} does not use hostname`);
        });
    });

    it('should work with --configfile', async function () {
        const args = ['--host', hostname, '--configfile', path.join(__dirname, 'noparse.json'), '--noParse'];
        await mb.start(args);

        const response = await http.responseFor({ method: 'GET', path: '/', hostname, port: 4545 });

        assert.strictEqual(response.body, '<% should not render through ejs');
    });

    it('should work with mb save', async function () {
        const imposters = { imposters: [{ protocol: 'http', port: 3000, recordRequests: false, stubs: [] }] };
        await mb.start(['--host', hostname]);
        await mb.put('/imposters', imposters);

        await mb.save(['--host', hostname]);

        try {
            assert.ok(fs.existsSync('mb.json'));
            assert.deepEqual(JSON.parse(fs.readFileSync('mb.json')), imposters);
        }
        finally {
            fs.unlinkSync('mb.json');
        }
    });

    it('should work with mb replay', async function () {
        const originServerPort = mb.port + 1,
            originServerStub = { responses: [{ is: { body: 'ORIGIN' } }] },
            originServerRequest = { protocol: 'http', port: originServerPort, stubs: [originServerStub] },
            proxyPort = mb.port + 2,
            proxyDefinition = { to: `http://${hostname}:${originServerPort}`, mode: 'proxyAlways' },
            proxyStub = { responses: [{ proxy: proxyDefinition }] },
            proxyRequest = { protocol: 'http', port: proxyPort, stubs: [proxyStub] };
        await mb.start(['--host', hostname]);
        await mb.put('/imposters', { imposters: [originServerRequest, proxyRequest] });

        await http.responseFor({ method: 'GET', path: '/', hostname, port: proxyPort });
        await mb.replay(['--host', hostname]);
        const response = await mb.get('/imposters?replayable=true'),
            imposters = response.body.imposters,
            oldProxyImposter = imposters.find(imposter => imposter.port === proxyPort),
            responses = oldProxyImposter.stubs[0].responses;

        assert.strictEqual(responses.length, 1);
        assert.strictEqual(responses[0].is.body, 'ORIGIN');
    });

    // Travis adds hostname into /etc/hosts file
    // eslint-disable-next-line mocha/no-setup-in-describe
    if (process.env.TRAVIS !== 'true') {
        it('should disallow localhost calls when bound to specific host', async function () {
            await mb.start(['--host', hostname]);

            try {
                await http.responseFor({ method: 'GET', path: '/', hostname: 'localhost', port: mb.port });
                assert.fail(`should not have connected (hostname: ${hostname})`);
            }
            catch (error) {
                assert.strictEqual(error.code, 'ECONNREFUSED');
            }
        });

        it('should bind http imposter to provided host', async function () {
            const imposter = { protocol: 'http', port: mb.port + 1 };
            await mb.start(['--host', hostname]);
            await mb.post('/imposters', imposter);

            const hostCall = await http.responseFor({
                method: 'GET',
                path: '/',
                hostname: hostname,
                port: imposter.port
            });
            assert.strictEqual(hostCall.statusCode, 200);

            try {
                await http.responseFor({
                    method: 'GET',
                    path: '/',
                    hostname: 'localhost',
                    port: imposter.port
                });
                assert.fail('should not have connected to localhost');
            }
            catch (error) {
                assert.strictEqual(error.code, 'ECONNREFUSED');
            }
        });

        it('should bind tcp imposter to provided host', async function () {
            const imposter = {
                    protocol: 'tcp',
                    port: mb.port + 1,
                    stubs: [{ responses: [{ is: { data: 'OK' } }] }]
                },
                client = require('../api/tcp/tcpClient');
            await mb.start(['--host', hostname]);
            await mb.post('/imposters', imposter);

            const hostCall = await client.send('TEST', imposter.port, 0, hostname);
            assert.strictEqual(hostCall.toString(), 'OK');

            try {
                await client.send('TEST', imposter.port, 0, 'localhost');
                assert.fail('should not have connected to localhost');
            }
            catch (error) {
                assert.strictEqual(error.code, 'ECONNREFUSED');
            }
        });

        it('should bind smtp imposter to provided host', async function () {
            const imposter = { protocol: 'smtp', port: mb.port + 1 },
                message = { from: '"From" <from@mb.org>', to: ['"To" <to@mb.org>'], subject: 'subject', text: 'text' },
                client = require('../api/smtp/smtpClient');
            await mb.start(['--host', hostname]);
            await mb.post('/imposters', imposter);

            await client.send(message, imposter.port, hostname);

            try {
                await client.send(message, imposter.port, 'localhost');
                assert.fail('should not have connected to localhost');
            }
            catch (error) {
                // ESOCKET in node v14, ECONNREFUSED before
                assert.ok(['ECONNREFUSED', 'ESOCKET'].indexOf(error.code) >= 0);
            }
        });
    }
});
