'use strict';

var assert = require('assert'),
    api = require('../api'),
    BaseHttpClient = require('./baseHttpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    fs = require('fs'),
    util = require('util');

['http', 'https'].forEach(function (protocol) {
    var client = BaseHttpClient.create(protocol);

    describe(protocol + ' imposter', function () {
        this.timeout(timeout);

        describe('POST /imposters with stubs', function () {
            promiseIt('should add latency when using behaviors.wait', function () {
                var stub = {
                        responses: [{
                            is: { body: 'stub' },
                            _behaviors: { wait: 1000 }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name },
                    timer;

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    timer = new Date();
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'stub');
                    var time = new Date() - timer;

                    // Occasionally there's some small inaccuracies
                    assert.ok(time >= 990, 'actual time: ' + time);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should add latency when using behaviors.wait as a function', function () {
                var fn = function () { return 1000; },
                    stub = {
                        responses: [{
                            is: { body: 'stub' },
                            _behaviors: { wait: fn.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name },
                    timer;

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    timer = new Date();
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'stub');
                    var time = new Date() - timer;

                    // Occasionally there's some small inaccuracies
                    assert.ok(time >= 990, 'actual time: ' + time);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support post-processing when using behaviors.decorate', function () {
                var decorator = function (request, response) {
                        response.body = response.body.replace('${YEAR}', new Date().getFullYear());
                    },
                    stub = {
                        responses: [{
                            is: { body: 'the year is ${YEAR}' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'the year is ' + new Date().getFullYear());
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should fix content-length if set and adjusted using decoration (issue #155)', function () {
                var decorator = function (request, response) {
                        response.body = 'length-8';
                    },
                    stub = {
                        responses: [{
                            is: {
                                body: 'len-5',
                                headers: { 'content-length': 5 }
                            },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'length-8');
                    assert.strictEqual(response.headers['content-length'], '8');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support using request parameters during decorating', function () {
                var decorator = function (request, response) {
                        response.body = response.body.replace('${PATH}', request.path);
                    },
                    stub = {
                        responses: [{
                            is: { body: 'the path is ${PATH}' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/test', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'the path is /test');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support using request parameters during decorating multiple times (issue #173)', function () {
                var decorator = function (request, response) {
                        response.body = response.body.replace('${id}', request.query.id);
                    },
                    stub = {
                        responses: [{
                            is: { body: 'request ${id}' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/test?id=100', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'request 100');
                    return api.get('/imposters/' + port);
                }).then(function () {
                    return client.get('/test?id=200', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'request 200');
                    return client.get('/test?id=300', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'request 300');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support decorate functions that return a value', function () {
                var decorator = function (request, response) {
                        var clonedResponse = JSON.parse(JSON.stringify(response));
                        clonedResponse.body = 'This is a clone';
                        return clonedResponse;
                    },
                    stub = {
                        responses: [{
                            is: { body: 'This is the original' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'This is a clone');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should not validate the decorate JavaScript function', function () {
                var decorator = "response.body = 'This should not work';",
                    stub = {
                        responses: [{
                            is: { body: 'This is the original' },
                            _behaviors: { decorate: decorator }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should repeat if behavior set and loop around responses with same repeat behavior (issue #165)', function () {
                var stub = {
                        responses: [
                            {
                                is: {
                                    body: 'first response',
                                    statusCode: 400,
                                    headers: { 'Content-Type': 'text/plain' }
                                },
                                _behaviors: { repeat: 2 }
                            },
                            {
                                is: { body: 'second response' },
                                _behaviors: { repeat: 3 }
                            },
                            { is: { body: 'third response' } }
                        ]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, response.body);
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body, 'first response');
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'first response');
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'second response');
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'second response');
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'second response');
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'third response');
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'first response');
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'first response');
                    return client.get('/', port);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should repeat consistently with headers (issue #158)', function () {
                var stub = {
                        responses: [
                            {
                                is: {
                                    body: 'first response',
                                    headers: { 'Content-Type': 'application/xml' }
                                },
                                _behaviors: { repeat: 2 }
                            },
                            { is: { body: 'second response' } }
                        ]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, response.body);
                    return client.get('/', port);
                }).then(function (response) {
                    assert.deepEqual(response.body, 'first response', 'first try');
                    return client.get('/', port);
                }).then(function (response) {
                    assert.deepEqual(response.body, 'first response', 'second try');
                    return client.get('/', port);
                }).then(function (response) {
                    assert.deepEqual(response.body, 'second response', 'third try');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support shell transforms', function () {
                var stub = {
                        responses: [{
                            is: { body: 'Hello, {YOU}!' },
                            _behaviors: { shellTransform: 'node shellTransformTest.js' }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name },
                    shellFn = function exec () {
                        console.log(process.argv[3].replace('{YOU}', 'mountebank'));
                    };

                fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

                // Temporary to debug Windows in Appveyor
                var execSync = require('child_process').execSync,
                    command = 'node shellTransformTest.js',
                    fullCommand = util.format("%s '%s' '%s'", command, JSON.stringify({ path: '/' }),
                        JSON.stringify({ body: 'Hello, {YOU}!' }));

                console.log('>>>>>>>>' + execSync(fullCommand).toString() + '<<<<<<<<<');

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'Hello, mountebank!');
                }).finally(function () {
                    fs.unlinkSync('shellTransformTest.js');
                    return api.del('/imposters');
                });
            });
        });
    });
});
