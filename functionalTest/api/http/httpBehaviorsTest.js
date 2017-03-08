'use strict';

var assert = require('assert'),
    api = require('../api').create(),
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

            promiseIt('should support copying from request fields using regex', function () {
                var stub = {
                        responses: [{
                            is: {
                                statusCode: '${code}',
                                headers: {
                                    'X-Test': '${header}'
                                },
                                body: '${body}'
                            },
                            _behaviors: {
                                copy: [
                                    {
                                        from: 'path',
                                        into: '${code}',
                                        using: { method: 'regex', selector: '\\d+' }
                                    },
                                    {
                                        from: { headers: 'X-Request' },
                                        into: '${header}',
                                        using: { method: 'regex', selector: '.+' }
                                    },
                                    {
                                        from: { query: 'body' },
                                        into: '${body}',
                                        using: {
                                            method: 'regex',
                                            selector: 'he\\w+$',
                                            options: { ignoreCase: true }
                                        }
                                    }
                                ]
                            }
                        }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.responseFor({
                        port: port,
                        method: 'GET',
                        headers: { 'x-request': 'header value' },
                        path: '/400/this-will-be-ignored?body=body%20is%20HERE'
                    });
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.headers['x-test'], 'header value');
                    assert.strictEqual(response.body, 'HERE');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support copying from request fields using xpath', function () {
                var stub = {
                        responses: [{
                            is: { body: 'Hello, NAME! Good to see you, NAME.' },
                            _behaviors: {
                                copy: [{
                                    from: 'body',
                                    into: 'NAME',
                                    using: {
                                        method: 'xpath',
                                        selector: '//mb:name',
                                        ns: { mb: 'http://example.com/mb' }
                                    }
                                }]
                            }
                        }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.post('/', '<doc xmlns:mb="http://example.com/mb"><mb:name>mountebank</mb:name></doc>', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'Hello, mountebank! Good to see you, mountebank.');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support copying from request fields using jsonpath', function () {
                var stub = {
                        responses: [{
                            is: { body: 'Hello, NAME! Good to see you, NAME.' },
                            _behaviors: {
                                copy: [{
                                    from: 'BODY',
                                    into: 'NAME',
                                    using: { method: 'jsonpath', selector: '$..name' }
                                }]
                            }
                        }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.post('/', JSON.stringify({ name: 'mountebank' }), port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'Hello, mountebank! Good to see you, mountebank.');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support lookup from CSV file keyed by regex', function () {
                var stub = {
                        responses: [{
                            is: {
                                statusCode: '${mountebank}["code"]',
                                headers: {
                                    'X-Occupation': '${mountebank}[occupation]'
                                },
                                body: "Hello ${mountebank}['name']. Have you been to ${bob}[location]?"
                            },
                            _behaviors: {
                                lookup: [
                                    {
                                        key: { from: 'path', using: { method: 'regex', selector: '/(.*)$' }, index: 1 },
                                        fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'name' } },
                                        into: '${mountebank}'
                                    },
                                    {
                                        key: { from: { headers: 'X-Bob' }, using: { method: 'regex', selector: '.+' } },
                                        fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'occupation' } },
                                        into: '${bob}'
                                    }
                                ]
                            }
                        }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                fs.writeFileSync('lookupTest.csv',
                    'name,code,occupation,location\n' +
                    'mountebank,400,tester,worldwide\n' +
                    'Brandon,404,mountebank,Dallas\n' +
                    'Bob Barker,500,"The Price Is Right","Darrington, Washington"');

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.responseFor({
                        port: port,
                        method: 'GET',
                        headers: { 'x-bob': 'The Price Is Right' },
                        path: '/mountebank'
                    });
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.headers['x-occupation'], 'tester');
                    assert.strictEqual(response.body, 'Hello mountebank. Have you been to Darrington, Washington?');
                }).finally(function () {
                    fs.unlinkSync('lookupTest.csv');
                    return api.del('/imposters');
                });
            });

            promiseIt('should support lookup from CSV file keyed by xpath', function () {
                var stub = {
                        responses: [{
                            is: { body: "Hello, YOU[name]! How is YOU['location'] today?" },
                            _behaviors: {
                                lookup: [{
                                    key: {
                                        from: 'body',
                                        using: {
                                            method: 'xpath',
                                            selector: '//mb:name',
                                            ns: { mb: 'http://example.com/mb' }
                                        }
                                    },
                                    fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'occupation' } },
                                    into: 'YOU'
                                }]
                            }
                        }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                fs.writeFileSync('lookupTest.csv',
                    'name,occupation,location\n' +
                    'mountebank,tester,worldwide\n' +
                    'Brandon,mountebank,Dallas\n' +
                    'Bob Barker,"The Price Is Right","Darrington, Washington"');

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.post('/', '<doc xmlns:mb="http://example.com/mb"><mb:name>mountebank</mb:name></doc>', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'Hello, Brandon! How is Dallas today?');
                }).finally(function () {
                    fs.unlinkSync('lookupTest.csv');
                    return api.del('/imposters');
                });
            });

            promiseIt('should support lookup from CSV file keyed by jsonpath', function () {
                var stub = {
                        responses: [{
                            is: { body: 'Hello, YOU["name"]! How is YOU[location] today?' },
                            _behaviors: {
                                lookup: [{
                                    key: { from: 'body', using: { method: 'jsonpath', selector: '$..occupation' } },
                                    fromDataSource: { csv: { path: 'lookupTest.csv', keyColumn: 'occupation' } },
                                    into: 'YOU'
                                }]
                            }
                        }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                fs.writeFileSync('lookupTest.csv',
                    'name,occupation,location\n' +
                    'mountebank,tester,worldwide\n' +
                    'Brandon,mountebank,Dallas\n' +
                    'Bob Barker,"The Price Is Right","Darrington, Washington"');

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.post('/', JSON.stringify({ occupation: 'mountebank' }), port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'Hello, Brandon! How is Dallas today?');
                }).finally(function () {
                    fs.unlinkSync('lookupTest.csv');
                    return api.del('/imposters');
                });
            });

            promiseIt('should compose multiple behaviors together', function () {
                var shellFn = function exec () {
                        console.log(process.argv[3].replace('${SALUTATION}', 'Hello'));
                    },
                    decorator = function (request, response) {
                        response.body = response.body.replace('${SUBJECT}', 'mountebank');
                    },
                    stub = {
                        responses: [
                            {
                                is: { body: '${SALUTATION}, ${SUBJECT}${PUNCTUATION}' },
                                _behaviors: {
                                    wait: 300,
                                    repeat: 2,
                                    shellTransform: 'node shellTransformTest.js',
                                    decorate: decorator.toString(),
                                    copy: [{
                                        from: { query: 'punctuation' },
                                        into: '${PUNCTUATION}',
                                        using: { method: 'regex', selector: '[,.?!]' }
                                    }]
                                }
                            },
                            {
                                is: { body: 'No behaviors' }
                            }
                        ]
                    },
                    stubs = [stub],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name },
                    timer = new Date();

                fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/?punctuation=!', port);
                }).then(function (response) {
                    var time = new Date() - timer;
                    assert.strictEqual(response.body, 'Hello, mountebank!');
                    assert.ok(time >= 250, 'actual time: ' + time);
                    return client.get('/?punctuation=!', port);
                }).then(function (response) {
                    var time = new Date() - timer;
                    assert.strictEqual(response.body, 'Hello, mountebank!');
                    assert.ok(time >= 250, 'actual time: ' + time);
                    return client.get('/?punctuation=!', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'No behaviors');
                }).finally(function () {
                    fs.unlinkSync('shellTransformTest.js');
                    return api.del('/imposters');
                });
            });
        });
    });
});
