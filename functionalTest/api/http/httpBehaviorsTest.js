'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    BaseHttpClient = require('./baseHttpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    fs = require('fs'),
    util = require('util');

['http', 'https'].forEach(protocol => {
    const client = BaseHttpClient.create(protocol);

    describe(`${protocol} imposter`, function () {
        this.timeout(timeout);

        describe('POST /imposters with stubs', function () {
            promiseIt('should add latency when using behaviors.wait', function () {
                const stub = {
                        responses: [{
                            is: { body: 'stub' },
                            _behaviors: { wait: 1000 }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol, port, stubs: stubs };
                let timer;

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    timer = new Date();
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'stub');
                    const time = new Date() - timer;

                    // Occasionally there's some small inaccuracies
                    assert.ok(time >= 990, `actual time: ${time}`);
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should add latency when using behaviors.wait as a function', function () {
                const fn = () => 1000,
                    stub = {
                        responses: [{
                            is: { body: 'stub' },
                            _behaviors: { wait: fn.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol, port, stubs: stubs };
                let timer;

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    timer = new Date();
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'stub');
                    const time = new Date() - timer;

                    // Occasionally there's some small inaccuracies
                    assert.ok(time >= 990, `actual time: ${time}`);
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should support post-processing when using behaviors.decorate', function () {
                const decorator = (request, response) => {
                        response.body = response.body.replace('${YEAR}', new Date().getFullYear());
                    },
                    stub = {
                        responses: [{
                            is: { body: 'the year is ${YEAR}' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol, port, stubs: stubs };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, `the year is ${new Date().getFullYear()}`);
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should fix content-length if set and adjusted using decoration (issue #155)', function () {
                const decorator = (request, response) => {
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
                    request = { protocol, port, stubs: stubs };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'length-8');
                    assert.strictEqual(response.headers['content-length'], '8');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should support using request parameters during decorating', function () {
                const decorator = (request, response) => {
                        response.body = response.body.replace('${PATH}', request.path);
                    },
                    stub = {
                        responses: [{
                            is: { body: 'the path is ${PATH}' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol, port, stubs: stubs };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/test', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'the path is /test');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should support using request parameters during decorating multiple times (issue #173)', function () {
                const decorator = (request, response) => {
                        response.body = response.body.replace('${id}', request.query.id);
                    },
                    stub = {
                        responses: [{
                            is: { body: 'request ${id}' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol, port, stubs: stubs };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/test?id=100', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'request 100');
                    return api.get(`/imposters/${port}`);
                }).then(() => client.get('/test?id=200', port)
                ).then(response => {
                    assert.strictEqual(response.body, 'request 200');
                    return client.get('/test?id=300', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'request 300');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should support decorate functions that return a value', function () {
                const decorator = (request, response) => {
                        const clonedResponse = JSON.parse(JSON.stringify(response));
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
                    request = { protocol, port, stubs: stubs };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'This is a clone');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should not validate the decorate JavaScript function', function () {
                const decorator = "response.body = 'This should not work';",
                    stub = {
                        responses: [{
                            is: { body: 'This is the original' },
                            _behaviors: { decorate: decorator }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol, port, stubs: stubs };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should repeat if behavior set and loop around responses with same repeat behavior (issue #165)', function () {
                const stub = {
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
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, response.body);
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body, 'first response');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'first response');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'second response');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'second response');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'second response');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'third response');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'first response');
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'first response');
                    return client.get('/', port);
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should repeat consistently with headers (issue #158)', function () {
                const stub = {
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
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, response.body);
                    return client.get('/', port);
                }).then(response => {
                    assert.deepEqual(response.body, 'first response', 'first try');
                    return client.get('/', port);
                }).then(response => {
                    assert.deepEqual(response.body, 'first response', 'second try');
                    return client.get('/', port);
                }).then(response => {
                    assert.deepEqual(response.body, 'second response', 'third try');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should repeat with JSON key of repeat (issue #237)', function () {
                const stub = {
                        responses: [
                            {
                                is: { body: 'This should repeat 2 times' },
                                _behaviors: { repeat: 2 }
                            },
                            { is: { body: 'Then you should see this' } }
                        ],
                        predicates: [{
                            equals: {
                                body: { repeat: true }
                            }
                        }]
                    },
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, response.body);
                    return client.post('/', { repeat: true }, port);
                }).then(response => {
                    assert.deepEqual(response.body, 'This should repeat 2 times', 'first try');
                    return client.post('/', { repeat: true }, port);
                }).then(response => {
                    assert.deepEqual(response.body, 'This should repeat 2 times', 'second try');
                    return client.post('/', { repeat: true }, port);
                }).then(response => {
                    assert.deepEqual(response.body, 'Then you should see this', 'third try');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should support shell transform without array for backwards compatibility', function () {
                // The string version of the shellTransform behavior is left for backwards
                // compatibility. It changed in v1.13.0 to accept an array.
                const stub = {
                        responses: [{
                            is: { body: 'Hello, {YOU}!' },
                            _behaviors: { shellTransform: 'node shellTransformTest.js' }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol, port, stubs: stubs },
                    shellFn = function exec () {
                        console.log(process.argv[3].replace('{YOU}', 'mountebank'));
                    };

                fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'Hello, mountebank!');
                }).finally(() => {
                    fs.unlinkSync('shellTransformTest.js');
                    return api.del('/imposters');
                });
            });

            promiseIt('should support array of shell transforms in order', function () {
                const stub = {
                        responses: [{
                            is: { body: 1 },
                            _behaviors: {
                                shellTransform: ['node double.js', 'node increment.js']
                            }
                        }]
                    },
                    stubs = [stub],
                    request = { protocol, port, stubs: stubs },
                    doubleFn = function double () {
                        const response = JSON.parse(process.argv[3]);
                        response.body *= 2;
                        console.log(JSON.stringify(response));
                    },
                    incrementFn = function increment () {
                        const response = JSON.parse(process.argv[3]);
                        response.body += 1;
                        console.log(JSON.stringify(response));
                    };

                fs.writeFileSync('double.js', util.format('%s\ndouble();', doubleFn.toString()));
                fs.writeFileSync('increment.js', util.format('%s\nincrement();', incrementFn.toString()));

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(response => {
                    assert.strictEqual(response.body, '3');
                }).finally(() => {
                    fs.unlinkSync('double.js');
                    fs.unlinkSync('increment.js');
                    return api.del('/imposters');
                });
            });

            promiseIt('should support copying from request fields using regex', function () {
                const stub = {
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
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.responseFor({
                        port,
                        method: 'GET',
                        headers: { 'x-request': 'header value' },
                        path: '/400/this-will-be-ignored?body=body%20is%20HERE'
                    });
                }).then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.headers['x-test'], 'header value');
                    assert.strictEqual(response.body, 'HERE');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should support copying from request fields using xpath', function () {
                const stub = {
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
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.post('/', '<doc xmlns:mb="http://example.com/mb"><mb:name>mountebank</mb:name></doc>', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'Hello, mountebank! Good to see you, mountebank.');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should support copying from request fields using jsonpath', function () {
                const stub = {
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
                    request = { protocol, port, stubs: [stub] };

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.post('/', JSON.stringify({ name: 'mountebank' }), port);
                }).then(response => {
                    assert.strictEqual(response.body, 'Hello, mountebank! Good to see you, mountebank.');
                }).finally(() => api.del('/imposters'));
            });

            promiseIt('should support lookup from CSV file keyed by regex', function () {
                const stub = {
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
                    request = { protocol, port, stubs: [stub] };

                fs.writeFileSync('lookupTest.csv',
                    'name,code,occupation,location\n' +
                    'mountebank,400,tester,worldwide\n' +
                    'Brandon,404,mountebank,Dallas\n' +
                    'Bob Barker,500,"The Price Is Right","Darrington, Washington"');

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.responseFor({
                        port,
                        method: 'GET',
                        headers: { 'x-bob': 'The Price Is Right' },
                        path: '/mountebank'
                    });
                }).then(response => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.headers['x-occupation'], 'tester');
                    assert.strictEqual(response.body, 'Hello mountebank. Have you been to Darrington, Washington?');
                }).finally(() => {
                    fs.unlinkSync('lookupTest.csv');
                    return api.del('/imposters');
                });
            });

            promiseIt('should support lookup from CSV file keyed by xpath', function () {
                const stub = {
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
                    request = { protocol, port, stubs: [stub] };

                fs.writeFileSync('lookupTest.csv',
                    'name,occupation,location\n' +
                    'mountebank,tester,worldwide\n' +
                    'Brandon,mountebank,Dallas\n' +
                    'Bob Barker,"The Price Is Right","Darrington, Washington"');

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.post('/', '<doc xmlns:mb="http://example.com/mb"><mb:name>mountebank</mb:name></doc>', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'Hello, Brandon! How is Dallas today?');
                }).finally(() => {
                    fs.unlinkSync('lookupTest.csv');
                    return api.del('/imposters');
                });
            });

            promiseIt('should support lookup from CSV file keyed by jsonpath', function () {
                const stub = {
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
                    request = { protocol, port, stubs: [stub] };

                fs.writeFileSync('lookupTest.csv',
                    'name,occupation,location\n' +
                    'mountebank,tester,worldwide\n' +
                    'Brandon,mountebank,Dallas\n' +
                    'Bob Barker,"The Price Is Right","Darrington, Washington"');

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.post('/', JSON.stringify({ occupation: 'mountebank' }), port);
                }).then(response => {
                    assert.strictEqual(response.body, 'Hello, Brandon! How is Dallas today?');
                }).finally(() => {
                    fs.unlinkSync('lookupTest.csv');
                    return api.del('/imposters');
                });
            });

            promiseIt('should compose multiple behaviors together', function () {
                const shellFn = function exec () {
                        console.log(process.argv[3].replace('${SALUTATION}', 'Hello'));
                    },
                    decorator = (request, response) => {
                        response.body = response.body.replace('${SUBJECT}', 'mountebank');
                    },
                    stub = {
                        responses: [
                            {
                                is: { body: '${SALUTATION}, ${SUBJECT}${PUNCTUATION}' },
                                _behaviors: {
                                    wait: 300,
                                    repeat: 2,
                                    shellTransform: ['node shellTransformTest.js'],
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
                    request = { protocol, port, stubs: stubs },
                    timer = new Date();

                fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

                return api.post('/imposters', request).then(response => {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/?punctuation=!', port);
                }).then(response => {
                    const time = new Date() - timer;
                    assert.strictEqual(response.body, 'Hello, mountebank!');
                    assert.ok(time >= 250, `actual time: ${time}`);
                    return client.get('/?punctuation=!', port);
                }).then(response => {
                    const time = new Date() - timer;
                    assert.strictEqual(response.body, 'Hello, mountebank!');
                    assert.ok(time >= 250, `actual time: ${time}`);
                    return client.get('/?punctuation=!', port);
                }).then(response => {
                    assert.strictEqual(response.body, 'No behaviors');
                }).finally(() => {
                    fs.unlinkSync('shellTransformTest.js');
                    return api.del('/imposters');
                });
            });
        });
    });
});
