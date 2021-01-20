'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    isWindows = require('os').platform().indexOf('win') === 0,
    port = api.port + 1,
    mb = require('../mb').create(port + 1),
    httpClient = require('../api/http/baseHttpClient').create('http'),
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout;

describe('security', function () {
    afterEach(async function () {
        await mb.stop();
    });

    describe('mb without --allowInjection', function () {
        this.timeout(timeout);

        it('should return a 400 if response injection is used', async function () {
            const fn = request => ({ body: `${request.method} INJECTED` }),
                stub = { responses: [{ inject: fn.toString() }] },
                request = { protocol: 'http', port, stubs: [stub] };
            await mb.start();

            const response = await mb.post('/imposters', request);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        });

        it('should return a 400 if predicate injection is used', async function () {
            const fn = () => true,
                stub = {
                    predicates: [{ inject: fn.toString() }],
                    responses: [{ is: { body: 'Hello, World! ' } }]
                },
                request = { protocol: 'http', port, stubs: [stub] };
            await mb.start();

            const response = await mb.post('/imposters', request);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        });

        it('should return a 400 if endOfResponseResolver is used', async function () {
            const stub = { responses: [{ is: { data: 'success' } }] },
                resolver = () => true,
                request = {
                    protocol: 'tcp',
                    port,
                    stubs: [stub],
                    mode: 'text',
                    endOfRequestResolver: { inject: resolver.toString() }
                };
            await mb.start();

            const response = await mb.post('/imposters', request);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        });

        it('should return a 400 if a decorate behavior is used', async function () {
            const fn = response => response,
                stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { decorate: fn.toString() } }] },
                request = { protocol: 'http', port, stubs: [stub] };
            await mb.start();

            const response = await mb.post('/imposters', request);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        });

        it('should return a 400 if a wait behavior function is used', async function () {
            const fn = () => 1000,
                stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { wait: fn.toString() } }] },
                request = { protocol: 'http', port, stubs: [stub] };
            await mb.start();

            const response = await mb.post('/imposters', request);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        });

        it('should allow a wait behavior that directly specifies latency', async function () {
            const stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { wait: 100 } }] },
                request = { protocol: 'http', port, stubs: [stub] };
            await mb.start();

            const response = await mb.post('/imposters', request);

            assert.strictEqual(response.statusCode, 201);
        });

        it('should return a 400 if a shellTransform behavior is used', async function () {
            const stub = { responses: [{ is: {}, _behaviors: { shellTransform: 'command' } }] },
                request = { protocol: 'http', port, stubs: [stub] };
            await mb.start();

            const response = await mb.post('/imposters', request);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        });

        it('should return a 400 if a proxy addDecorateBehavior is used', async function () {
            const proxy = {
                    to: 'http://google.com',
                    addDecorateBehavior: '(request, response) => { response.body = ""; }'
                },
                stub = { responses: [{ proxy: proxy }] },
                request = { protocol: 'http', port, stubs: [stub] };
            await mb.start();

            const response = await mb.post('/imposters', request);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        });

        it('should return a 400 if a predicateGenerator inject is used', async function () {
            const proxy = {
                    to: 'http://google.com',
                    predicateGenerators: [{
                        inject: 'fn () { return []; }'
                    }]
                },
                stub = { responses: [{ proxy: proxy }] },
                request = { protocol: 'http', port, stubs: [stub] };
            await mb.start();

            const response = await mb.post('/imposters', request);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        });
    });

    describe('IP blocking', function () {
        this.timeout(10000);

        function useInterface (name) {
            return name.indexOf('utun') < 0 // This causes problems on my Mac
                && name.indexOf('awdl') < 0 // This causes problems on my Mac
                && name.indexOf(' ') < 0; // This causes problems on Appveyor / Windows
        }

        function ips (local) {
            const os = require('os'),
                interfaces = os.networkInterfaces(),
                result = [];

            Object.keys(interfaces).forEach(name => {
                if (useInterface(name)) {
                    interfaces[name].forEach(address => {
                        if (address.internal === local) {
                            result.push({
                                family: address.family.replace('IPv', ''),
                                address: address.address,
                                iface: name
                            });
                        }
                    });
                }
            });
            return result;
        }

        function localIPs () {
            return ips(true);
        }

        function nonLocalIPs () {
            return ips(false);
        }

        async function connectToHTTPServerUsing (ip, destinationPort = mb.port) {
            try {
                await httpClient.responseFor({
                    method: 'POST',
                    path: '/imposters',
                    hostname: 'localhost',
                    port: destinationPort,
                    localAddress: ip.address,
                    family: ip.family,
                    body: { protocol: 'http' }
                });
                return { ip: ip.address, canConnect: true };
            }
            catch (error) {
                if (error.code === 'EADDRNOTAVAIL' && ip.address.indexOf('%') < 0) {
                    // If you run ifconfig, some of the addresses have the interface name
                    // appended. Node doesn't return them that way,
                    // but apparently needs it sometimes to bind to that address.
                    // Apparently it has to do with link local addresses:
                    // https://stackoverflow.com/questions/34259279/node-js-cant-bind-a-udp6-socket-to-a-specific-address
                    return connectToHTTPServerUsing({
                        address: `${ip.address}%${ip.iface}`,
                        family: ip.family,
                        iface: ip.iface
                    }, destinationPort);
                }
                else {
                    return { ip: ip.address, canConnect: false, error: error };
                }
            }
        }

        function connectToTCPServerUsing (ip, destinationPort) {
            return new Promise(res => {
                let isPending = true;
                const net = require('net'),
                    socket = net.createConnection({ family: ip.family, localAddress: ip.address, port: destinationPort },
                        () => { socket.write('TEST'); }),
                    resolve = result => {
                        isPending = false;
                        res(result);
                    };

                socket.once('data', () => { resolve({ ip: ip.address, canConnect: true }); });

                socket.once('end', () => {
                    if (isPending) {
                        resolve({ ip: ip.address, canConnect: false, error: { code: 'ECONNRESET' } });
                    }
                });

                socket.once('error', async error => {
                    if (error.code === 'EADDRNOTAVAIL' && ip.address.indexOf('%') < 0) {
                        const ipWithInterface = {
                            address: `${ip.address}%${ip.iface}`,
                            family: ip.family,
                            iface: ip.iface
                        };
                        resolve(await connectToTCPServerUsing(ipWithInterface, destinationPort));
                    }
                    else {
                        resolve({ ip: ip.address, canConnect: false, error: error });
                    }
                });
            });
        }

        function denied (attempt) {
            return !attempt.canConnect && attempt.error.code === 'ECONNRESET';
        }

        function allowed (attempt) {
            return attempt.canConnect;
        }

        it('should only allow local requests if --localOnly used', async function () {
            await mb.start(['--localOnly']);

            const rejections = await Promise.all(nonLocalIPs().map(ip => connectToHTTPServerUsing(ip))),
                allBlocked = rejections.every(denied);
            assert.ok(allBlocked, 'Allowed nonlocal connection: ' + JSON.stringify(rejections, null, 2));

            // Ensure mountebank rejected the request as well
            const response = await mb.get('/imposters');
            assert.deepEqual(response.body, { imposters: [] }, JSON.stringify(response.body, null, 2));

            const accepts = await Promise.all(localIPs().map(ip => connectToHTTPServerUsing(ip))),
                allAccepted = accepts.every(allowed);
            assert.ok(allAccepted, 'Blocked local connection: ' + JSON.stringify(accepts, null, 2));
        });

        it('should only allow local requests to http imposter if --localOnly used', async function () {
            const imposter = { protocol: 'http', port: mb.port + 1 };
            await mb.start(['--localOnly']);
            await mb.post('/imposters', imposter);

            const rejections = await Promise.all(nonLocalIPs().map(ip => connectToHTTPServerUsing(ip, imposter.port))),
                allBlocked = rejections.every(denied);
            assert.ok(allBlocked, 'Allowed nonlocal connection: ' + JSON.stringify(rejections, null, 2));

            const accepts = await Promise.all(localIPs().map(ip => connectToHTTPServerUsing(ip, imposter.port))),
                allAccepted = accepts.every(allowed);
            assert.ok(allAccepted, 'Blocked local connection: ' + JSON.stringify(accepts, null, 2));
        });

        it('should only allow local requests to tcp imposter if --localOnly used', async function () {
            const imposter = {
                protocol: 'tcp',
                port: mb.port + 1,
                stubs: [{ responses: [{ is: { data: 'OK' } }] }]
            };
            await mb.start(['--localOnly', '--loglevel', 'debug']);
            await mb.post('/imposters', imposter);

            const rejections = await Promise.all(nonLocalIPs().map(ip => connectToTCPServerUsing(ip, imposter.port))),
                allBlocked = rejections.every(denied);
            assert.ok(allBlocked, 'Allowed nonlocal connection: ' + JSON.stringify(rejections, null, 2));

            const accepts = await Promise.all(localIPs().map(ip => connectToTCPServerUsing(ip, imposter.port))),
                allAccepted = accepts.every(allowed);
            assert.ok(allAccepted, 'Blocked local connection: ' + JSON.stringify(accepts, null, 2));
        });

        it('should allow non-local requests if --localOnly not used', async function () {
            await mb.start();

            const allIPs = localIPs().concat(nonLocalIPs()),
                results = await Promise.all(allIPs.map(ip => connectToHTTPServerUsing(ip))),
                allAccepted = results.every(allowed);

            assert.ok(allAccepted, 'Blocked local connection: ' + JSON.stringify(results, null, 2));
        });

        it('should block IPs not on --ipWhitelist', async function () {
            if (nonLocalIPs().length < 2) {
                console.log('Skipping test - not enough IPs to test with');
                return;
            }

            const allowedIP = nonLocalIPs()[0],
                blockedIPs = nonLocalIPs().slice(1),
                ipWhitelist = `127.0.0.1|${allowedIP.address}`;
            await mb.start(['--ipWhitelist', ipWhitelist]);

            const result = await connectToHTTPServerUsing(allowedIP);
            assert.ok(result.canConnect, 'Could not connect to whitelisted IP: ' + JSON.stringify(result, null, 2));

            const results = await Promise.all(blockedIPs.map(ip => connectToHTTPServerUsing(ip))),
                allBlocked = results.every(denied);

            assert.ok(allBlocked, 'Allowed non-whitelisted connection: ' + JSON.stringify(results, null, 2));
        });

        it('should ignore --ipWhitelist if --localOnly passed', async function () {
            if (nonLocalIPs().length === 0) {
                console.log('Skipping test - not enough IPs to test with');
                return;
            }

            const allowedIP = nonLocalIPs()[0],
                ipWhitelist = `127.0.0.1|${allowedIP.address}`;
            await mb.start(['--localOnly', '--ipWhitelist', ipWhitelist]);

            const result = await connectToHTTPServerUsing(allowedIP);

            assert.ok(!result.canConnect, 'Should have blocked whitelisted IP: ' + JSON.stringify(result, null, 2));
        });
    });
});
