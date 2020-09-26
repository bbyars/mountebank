'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    isWindows = require('os').platform().indexOf('win') === 0,
    promiseIt = require('../testHelpers').promiseIt,
    port = api.port + 1,
    mb = require('../mb').create(port + 1),
    httpClient = require('../api/http/baseHttpClient').create('http'),
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 4000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    Q = require('q');

describe('security', function () {
    describe('mb without --allowInjection', function () {
        this.timeout(timeout);

        promiseIt('should return a 400 if response injection is used', function () {
            const fn = request => ({ body: `${request.method} INJECTED` }),
                stub = { responses: [{ inject: fn.toString() }] },
                request = { protocol: 'http', port, stubs: [stub] };

            return mb.start()
                .then(() => mb.post('/imposters', request))
                .then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                })
                .finally(() => mb.stop());
        });

        promiseIt('should return a 400 if predicate injection is used', function () {
            const fn = () => true,
                stub = {
                    predicates: [{ inject: fn.toString() }],
                    responses: [{ is: { body: 'Hello, World! ' } }]
                },
                request = { protocol: 'http', port, stubs: [stub] };

            return mb.start()
                .then(() => mb.post('/imposters', request))
                .then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                })
                .finally(() => mb.stop());
        });

        promiseIt('should return a 400 if endOfResponseResolver is used', function () {
            const stub = { responses: [{ is: { data: 'success' } }] },
                resolver = () => true,
                request = {
                    protocol: 'tcp',
                    port,
                    stubs: [stub],
                    mode: 'text',
                    endOfRequestResolver: { inject: resolver.toString() }
                };

            return mb.start()
                .then(() => mb.post('/imposters', request))
                .then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                })
                .finally(() => mb.stop());
        });

        promiseIt('should return a 400 if a decorate behavior is used', function () {
            const fn = response => response,
                stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { decorate: fn.toString() } }] },
                request = { protocol: 'http', port, stubs: [stub] };

            return mb.start()
                .then(() => mb.post('/imposters', request))
                .then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                })
                .finally(() => mb.stop());
        });

        promiseIt('should return a 400 if a wait behavior function is used', function () {
            const fn = () => 1000,
                stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { wait: fn.toString() } }] },
                request = { protocol: 'http', port, stubs: [stub] };

            return mb.start()
                .then(() => mb.post('/imposters', request))
                .then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                })
                .finally(() => mb.stop());
        });

        promiseIt('should allow a wait behavior that directly specifies latency', function () {
            const stub = { responses: [{ is: { body: 'Hello, World! ' }, _behaviors: { wait: 100 } }] },
                request = { protocol: 'http', port, stubs: [stub] };

            return mb.start()
                .then(() => mb.post('/imposters', request))
                .then(response => {
                    assert.strictEqual(response.statusCode, 201);
                })
                .finally(() => mb.stop());
        });

        promiseIt('should return a 400 if a shellTransform behavior is used', function () {
            const stub = { responses: [{ is: {}, _behaviors: { shellTransform: 'command' } }] },
                request = { protocol: 'http', port, stubs: [stub] };

            return mb.start()
                .then(() => mb.post('/imposters', request))
                .then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                })
                .finally(() => mb.stop());
        });

        promiseIt('should return a 400 if a proxy addDecorateBehavior is used', function () {
            const proxy = {
                    to: 'http://google.com',
                    addDecorateBehavior: '(request, response) => { response.body = ""; }'
                },
                stub = { responses: [{ proxy: proxy }] },
                request = { protocol: 'http', port, stubs: [stub] };

            return mb.start()
                .then(() => mb.post('/imposters', request))
                .then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                })
                .finally(() => mb.stop());
        });

        promiseIt('should return a 400 if a predicateGenerator inject is used', function () {
            const proxy = {
                    to: 'http://google.com',
                    predicateGenerators: [{
                        inject: 'fn () { return []; }'
                    }]
                },
                stub = { responses: [{ proxy: proxy }] },
                request = { protocol: 'http', port, stubs: [stub] };

            return mb.start()
                .then(() => mb.post('/imposters', request))
                .then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                })
                .finally(() => mb.stop());
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

        function connectToHTTPServerUsing (ip, destinationPort = mb.port) {
            return httpClient.responseFor({
                method: 'POST',
                path: '/imposters',
                hostname: 'localhost',
                port: destinationPort,
                localAddress: ip.address,
                family: ip.family,
                body: { protocol: 'http' }
            }).then(
                () => Q({ ip: ip.address, canConnect: true }),
                error => {
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
                        return Q({ ip: ip.address, canConnect: false, error: error });
                    }
                }
            );
        }

        function connectToTCPServerUsing (ip, destinationPort) {
            const deferred = Q.defer(),
                net = require('net'),
                socket = net.createConnection({ family: ip.family, localAddress: ip.address, port: destinationPort },
                    () => { socket.write('TEST'); });

            socket.once('data', () => { deferred.resolve({ ip: ip.address, canConnect: true }); });

            socket.once('end', () => {
                if (deferred.promise.isPending()) {
                    deferred.resolve({ ip: ip.address, canConnect: false, error: { code: 'ECONNRESET' } });
                }
            });

            socket.once('error', error => {
                if (error.code === 'EADDRNOTAVAIL' && ip.address.indexOf('%') < 0) {
                    const ipWithInterface = {
                        address: `${ip.address}%${ip.iface}`,
                        family: ip.family,
                        iface: ip.iface
                    };
                    connectToTCPServerUsing(ipWithInterface, destinationPort).done(deferred.resolve);
                }
                else {
                    deferred.resolve({ ip: ip.address, canConnect: false, error: error });
                }
            });

            return deferred.promise;
        }

        function denied (attempt) {
            return !attempt.canConnect && attempt.error.code === 'ECONNRESET';
        }

        function allowed (attempt) {
            return attempt.canConnect;
        }

        promiseIt('should only allow local requests if --localOnly used', function () {
            return mb.start(['--localOnly'])
                .then(() => Q.all(nonLocalIPs().map(ip => connectToHTTPServerUsing(ip))))
                .then(rejections => {
                    const allBlocked = rejections.every(denied);
                    assert.ok(allBlocked, 'Allowed nonlocal connection: ' + JSON.stringify(rejections, null, 2));

                    // Ensure mountebank rejected the request as well
                    return mb.get('/imposters');
                }).then(response => {
                    assert.deepEqual(response.body, { imposters: [] }, JSON.stringify(response.body, null, 2));

                    return Q.all(localIPs().map(ip => connectToHTTPServerUsing(ip)));
                }).then(accepts => {
                    const allAccepted = accepts.every(allowed);
                    assert.ok(allAccepted, 'Blocked local connection: ' + JSON.stringify(accepts, null, 2));
                })
                .finally(() => mb.stop());
        });

        promiseIt('should only allow local requests to http imposter if --localOnly used', function () {
            const imposter = { protocol: 'http', port: mb.port + 1 };

            return mb.start(['--localOnly'])
                .then(() => mb.post('/imposters', imposter))
                .then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return Q.all(nonLocalIPs().map(ip => connectToHTTPServerUsing(ip, imposter.port)));
                })
                .then(rejections => {
                    const allBlocked = rejections.every(denied);
                    assert.ok(allBlocked, 'Allowed nonlocal connection: ' + JSON.stringify(rejections, null, 2));

                    return Q.all(localIPs().map(ip => connectToHTTPServerUsing(ip, imposter.port)));
                }).then(accepts => {
                    const allAccepted = accepts.every(allowed);
                    assert.ok(allAccepted, 'Blocked local connection: ' + JSON.stringify(accepts, null, 2));
                })
                .finally(() => mb.stop());
        });

        promiseIt('should only allow local requests to tcp imposter if --localOnly used', function () {
            const imposter = {
                protocol: 'tcp',
                port: mb.port + 1,
                stubs: [{ responses: [{ is: { data: 'OK' } }] }]
            };

            return mb.start(['--localOnly', '--loglevel', 'debug'])
                .then(() => mb.post('/imposters', imposter))
                .then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return Q.all(nonLocalIPs().map(ip => connectToTCPServerUsing(ip, imposter.port)));
                })
                .then(rejections => {
                    const allBlocked = rejections.every(denied);
                    assert.ok(allBlocked, 'Allowed nonlocal connection: ' + JSON.stringify(rejections, null, 2));

                    return Q.all(localIPs().map(ip => connectToTCPServerUsing(ip, imposter.port)));
                }).then(accepts => {
                    const allAccepted = accepts.every(allowed);
                    assert.ok(allAccepted, 'Blocked local connection: ' + JSON.stringify(accepts, null, 2));
                })
                .finally(() => mb.stop());
        });

        promiseIt('should allow non-local requests if --localOnly not used', function () {
            const allIPs = localIPs().concat(nonLocalIPs());

            return mb.start()
                .then(() => Q.all(allIPs.map(ip => connectToHTTPServerUsing(ip))))
                .then(results => {
                    const allAccepted = results.every(allowed);
                    assert.ok(allAccepted, 'Blocked local connection: ' + JSON.stringify(results, null, 2));
                })
                .finally(() => mb.stop());
        });

        promiseIt('should block IPs not on --ipWhitelist', function () {
            if (nonLocalIPs().length < 2) {
                console.log('Skipping test - not enough IPs to test with');
                return Q(true);
            }

            const allowedIP = nonLocalIPs()[0],
                blockedIPs = nonLocalIPs().slice(1),
                ipWhitelist = `127.0.0.1|${allowedIP.address}`;

            return mb.start(['--ipWhitelist', ipWhitelist])
                .then(() => connectToHTTPServerUsing(allowedIP))
                .then(result => {
                    assert.ok(result.canConnect, 'Could not connect to whitelisted IP: ' + JSON.stringify(result, null, 2));
                    return Q.all(blockedIPs.map(ip => connectToHTTPServerUsing(ip)));
                })
                .then(results => {
                    const allBlocked = results.every(denied);
                    assert.ok(allBlocked, 'Allowed non-whitelisted connection: ' + JSON.stringify(results, null, 2));
                })
                .finally(() => mb.stop());
        });

        promiseIt('should ignore --ipWhitelist if --localOnly passed', function () {
            if (nonLocalIPs().length === 0) {
                console.log('Skipping test - not enough IPs to test with');
                return Q(true);
            }

            const allowedIP = nonLocalIPs()[0],
                ipWhitelist = `127.0.0.1|${allowedIP.address}`;

            return mb.start(['--localOnly', '--ipWhitelist', ipWhitelist])
                .then(() => connectToHTTPServerUsing(allowedIP))
                .then(result => {
                    assert.ok(!result.canConnect, 'Should have blocked whitelisted IP: ' + JSON.stringify(result, null, 2));
                })
                .finally(() => mb.stop());
        });
    });
});
