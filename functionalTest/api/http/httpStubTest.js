'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    BaseHttpClient = require('./baseHttpClient'),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    helpers = require('../../../src/util/helpers');

['http', 'https'].forEach(protocol => {
    const client = BaseHttpClient.create(protocol);

    describe(`${protocol} imposter`, function () {
        this.timeout(timeout);

        afterEach(async function () {
            await api.del('/imposters');
        });

        describe('POST /imposters with stubs', function () {
            it('should return stubbed response', async function () {
                const stub = {
                        responses: [{
                            is: {
                                statusCode: 400,
                                headers: { 'X-Test': 'test header' },
                                body: 'test body',
                                query: {
                                    key: true
                                }
                            }
                        }]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.get('/test?key=true', port);

                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body, 'test body');
                assert.strictEqual(response.headers['x-test'], 'test header');
            });

            it('should allow a sequence of stubs as a circular buffer', async function () {
                const stub = { responses: [{ is: { statusCode: 400 } }, { is: { statusCode: 405 } }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const first = await client.get('/test', port);
                assert.strictEqual(first.statusCode, 400);

                const second = await client.get('/test', port);
                assert.strictEqual(second.statusCode, 405);

                const third = await client.get('/test', port);
                assert.strictEqual(third.statusCode, 400);

                const fourth = await client.get('/test', port);
                assert.strictEqual(fourth.statusCode, 405);
            });

            it('should only return stubbed response if matches complex predicate', async function () {
                const spec = {
                        path: '/test?key=value&next=true',
                        port,
                        method: 'POST',
                        headers: {
                            'X-One': 'Test',
                            'X-Two': 'Test',
                            'Content-Type': 'text/plain'
                        }
                    },
                    stub = {
                        responses: [{ is: { statusCode: 400 } }],
                        predicates: [
                            { equals: { path: '/test', method: 'POST' } },
                            { equals: { query: { key: 'value' } } },
                            { exists: { headers: { 'X-One': true } } },
                            { exists: { headers: { 'X-Two': true } } },
                            { equals: { headers: { 'X-Two': 'Test' } } },
                            { exists: { headers: { 'X-Three': false } } },
                            { not: { exists: { headers: { 'X-Four': true } } } },
                            { startsWith: { body: 'T' } },
                            { contains: { body: 'ES' } },
                            { endsWith: { body: 'T' } },
                            { matches: { body: '^TEST$' } },
                            { equals: { body: 'TEST' } },
                            { exists: { body: true } }
                        ]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const first = await client.responseFor(helpers.merge(spec, { path: '/', body: 'TEST' }));
                assert.strictEqual(first.statusCode, 200, 'should not have matched; wrong path');

                const second = await client.responseFor(helpers.merge(spec, { path: '/test?key=different', body: 'TEST' }));
                assert.strictEqual(second.statusCode, 200, 'should not have matched; wrong query');

                const third = await client.responseFor(helpers.merge(spec, { method: 'PUT', body: 'TEST' }));
                assert.strictEqual(third.statusCode, 200, 'should not have matched; wrong method');

                const missingHeaderOptions = helpers.merge(spec, { body: 'TEST' });
                delete missingHeaderOptions.headers['X-One'];
                const fourth = await client.responseFor(missingHeaderOptions);
                assert.strictEqual(fourth.statusCode, 200, 'should not have matched; missing header');

                const fifth = await client.responseFor(helpers.merge(spec, { headers: { 'X-Two': 'Testing', body: 'TEST' } }));
                assert.strictEqual(fifth.statusCode, 200, 'should not have matched; wrong value for header');

                const sixth = await client.responseFor(helpers.merge(spec, { body: 'TESTing' }));
                assert.strictEqual(sixth.statusCode, 200, 'should not have matched; wrong value for body');

                const seventh = await client.responseFor(helpers.merge(spec, { body: 'TEST' }));
                assert.strictEqual(seventh.statusCode, 400, 'should have matched');
            });

            it('should correctly handle deepEquals object predicates', async function () {
                const stubWithEmptyObjectPredicate = {
                        responses: [{ is: { body: 'first stub' } }],
                        predicates: [{ deepEquals: { query: {} } }]
                    },
                    stubWithPredicateKeywordInObject = {
                        responses: [{ is: { body: 'second stub' } }],
                        predicates: [{ deepEquals: { query: { equals: 1 } } }]
                    },
                    stubWithTwoKeywordsInObject = {
                        responses: [{ is: { body: 'third stub' } }],
                        predicates: [{ deepEquals: { query: { equals: 'true', contains: false } } }]
                    },
                    stubs = [stubWithEmptyObjectPredicate, stubWithPredicateKeywordInObject, stubWithTwoKeywordsInObject],
                    request = { protocol, port, stubs: stubs };
                await api.createImposter(request);

                const first = await client.get('/', port);
                assert.strictEqual(first.body, 'first stub');

                const second = await client.get('/?equals=something', port);
                assert.strictEqual(second.body, '');

                const third = await client.get('/?equals=1', port);
                assert.strictEqual(third.body, 'second stub');

                const fourth = await client.get('/?contains=false&equals=true', port);
                assert.strictEqual(fourth.body, 'third stub');

                const fifth = await client.get('/?contains=false&equals=true&matches=yes', port);
                assert.strictEqual(fifth.body, '');
            });

            it('should support sending binary response', async function () {
                const buffer = Buffer.from([0, 1, 2, 3]),
                    stub = { responses: [{ is: { body: buffer.toString('base64'), _mode: 'binary' } }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.responseFor({ method: 'GET', port, path: '/', mode: 'binary' });

                assert.deepEqual(response.body.toJSON().data, [0, 1, 2, 3]);
            });

            it('should support JSON bodies', async function () {
                const stub = {
                        responses: [
                            {
                                is: {
                                    body: {
                                        key: 'value',
                                        sub: {
                                            'string-key': 'value'
                                        },
                                        arr: [1, 2]
                                    }
                                }
                            },
                            {
                                is: {
                                    body: {
                                        key: 'second request'
                                    }
                                }
                            }
                        ]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const first = await client.get('/', port);
                assert.deepEqual(JSON.parse(first.body), {
                    key: 'value',
                    sub: {
                        'string-key': 'value'
                    },
                    arr: [1, 2]
                });

                const second = await client.get('/', port);
                assert.deepEqual(JSON.parse(second.body), { key: 'second request' });
            });

            it('should support treating the body as a JSON object for predicate matching', async function () {
                const stub = {
                        responses: [{ is: { body: 'SUCCESS' } }],
                        predicates: [
                            { equals: { body: { key: 'value' } } },
                            { equals: { body: { arr: 3 } } },
                            { deepEquals: { body: { key: 'value', arr: [2, 1, 3] } } },
                            { matches: { body: { key: '^v' } } }
                        ]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.post('/', '{"key": "value", "arr": [3,2,1]}', port);

                assert.strictEqual(response.body, 'SUCCESS');
            });

            it('should support changing default response for stub', async function () {
                const stub = {
                        responses: [
                            { is: { body: 'Wrong address' } },
                            { is: { statusCode: 500 } }
                        ],
                        predicates: [{ equals: { path: '/' } }]
                    },
                    defaultResponse = { statusCode: 404, body: 'Not found' },
                    request = { protocol, port, defaultResponse: defaultResponse, stubs: [stub] };
                await api.createImposter(request);

                const first = await client.get('/', port);
                assert.strictEqual(first.statusCode, 404);
                assert.strictEqual(first.body, 'Wrong address');

                const second = await client.get('/', port);
                assert.strictEqual(second.statusCode, 500);
                assert.strictEqual(second.body, 'Not found');

                const third = await client.get('/differentStub', port);
                assert.strictEqual(third.statusCode, 404);
                assert.strictEqual(third.body, 'Not found');
            });

            it('should support keepalive connections', async function () {
                const stub = { responses: [{ is: { body: 'Success' } }] },
                    defaultResponse = { headers: { CONNECTION: 'Keep-Alive' } }, // tests case-sensitivity of header match
                    request = { protocol, port, defaultResponse: defaultResponse, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.get('/', port);

                assert.strictEqual(response.body, 'Success');
                assert.strictEqual(response.headers.connection, 'Keep-Alive');
            });

            it('should support sending multiple values back for same header', async function () {
                const stub = { responses: [{ is: { headers: { 'Set-Cookie': ['first', 'second'] } } }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.get('/', port);

                assert.deepEqual(response.headers['set-cookie'], ['first', 'second']);
            });

            it('should support sending JSON bodies with _links field for canned responses', async function () {
                const stub = { responses: [{ is: {
                        headers: { 'Content-Type': 'application/json' },
                        body: { _links: { self: { href: '/products/123' } } }
                    } }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.get('/', port);

                assert.deepEqual(response.body, { _links: { self: { href: '/products/123' } } });
            });

            it('should correctly set content-length for binary data', async function () {
                // https://github.com/bbyars/mountebank/issues/204
                const stub = {
                        responses: [{
                            is: {
                                headers: { 'Content-Length': 852 },
                                body: 'H4sIAAAAAAAEAO29B2AcSZYlJi9tynt/SvVK1+B0oQiAYBMk2JBAEOzBiM3mkuwdaUcjKasqgcplVmVdZhZAzO2dvPfee++999577733ujudTif33/8/XGZkAWz2zkrayZ4hgKrIHz9+fB8/In7xR8Xso0cfzab3p/vn053t/NPZbHt/cn5/++D+5N72pwefTnd2JtP8/CD7aPRR02btuqH2zXo6zZuGPpplbfbRo1/80arMlviZXWZFmU2Ksmiv8XdbLPIfVMucXsqb9vfPZy29VC3LAh/94o8WFb91XlcLarFz/9HODn3fVvTH3h7++CX015qbbmxzldMwbmjTztc3tjmvixvbNFnrt3mIj02bXfyBNutgXJE2v4RagWi//zRftnVWonlZXVALmpNFdpH//uuaPvxo3rar5tHdu9NFsz3LL8fL7JJIOivejafV4m5z3bT54u55UebN3d27/GIzXi0vqDei8VsPCMEI3gWadd5U65qm8qNH3/vFHy2zBVH6o5d1dVnM8jp9WtT5tK3qawLWg7PM2zH9n6C4F+dZvcim1+//YlUW0yJv0l+YUufTfLYmxG757vG6nVd18YOsLapl+rxowGC3efFZVS/WZXZ7JA1ZXuXneZ0vpzmh+0oJmH6+pu9ui/MJTU0xzUqM9qLOFrd9z9I1rc7Tb+dZ2c4BgtFq0mKZvsiv0t+nqt9uhPd9YnMa+8Cc5wugtJoX0/RsiXZC2Ff5L1qTAKeg2kboDtuTqqpnxVLeJ4Sf5Mv8vGib94JRZsXivd54WefbJ3ndFudEYe76xpeJINNqdV0XF3OSbPd72rR1sbxIdyGtv+T/AdOWKsArBQAA',
                                _mode: 'binary'
                            }
                        }]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.get('/', port);

                assert.deepEqual(response.headers['content-length'], 639);
            });

            it('should correctly set content-length for binary data when using multiline base64', async function () {
                const stub = {
                        responses: [{
                            is: {
                                headers: { 'Content-Length': 274 },
                                body: 'iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyBAMAAABYG2ONAAAAFVBMVEUAAAD///9/f39fX1+fn58f\nHx8/Pz8rYiDqAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAo0lEQVRIie2Qyw7CIBBFb2DwO5q+1o0L\n1w0NrrHRPQnV//8EAUl0ga1ujIs5CZAz4YYZAIZhmN/QQOkjzq3LLuv6xUrQHmTJGphcEGE9rUQ3\nY4bqqrDjAlgQoJK9Z8YBmFy8Gp8DeSeTfRSBCf2I6/JN5ORiRfrNiIfqh9S9SVPL27A1C0G4EX2e\nJR7J1iI7rbG0Vf4x0UwPW0Uh3i0bwzD/yR11mBj1DIKiVwAAAABJRU5ErkJggg==\n',
                                _mode: 'binary'
                            }
                        }]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.get('/', port);

                assert.deepEqual(response.headers['content-length'], 274);
            });

            it('should handle JSON null values', async function () {
                // https://github.com/bbyars/mountebank/issues/209
                const stub = { responses: [{ is: { body: { name: 'test', type: null } } }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.get('/', port);

                assert.deepEqual(JSON.parse(response.body), { name: 'test', type: null });
            });

            it('should handle null values in deepEquals predicate (issue #229)', async function () {
                const stub = {
                        predicates: [{ deepEquals: { body: { field: null } } }],
                        responses: [{ is: { body: 'SUCCESS' } }]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.post('/', { field: null }, port);

                assert.strictEqual(response.body, 'SUCCESS');
            });

            it('should support array predicates with xpath', async function () {
                const stub = {
                        responses: [{ is: { body: 'SUCCESS' } }],
                        predicates: [{
                            equals: { body: ['first', 'third', 'second'] },
                            xpath: { selector: '//value' }
                        }]
                    },
                    xml = '<values><value>first</value><value>second</value><value>third</value></values>',
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.post('/', xml, port);

                assert.strictEqual(response.body, 'SUCCESS');
            });

            it('should support matches predicate on uppercase JSON key (issue #228)', async function () {
                const stub = {
                        predicates: [{ matches: { body: { Key: '^Value' } } }],
                        responses: [{ is: { body: 'SUCCESS' } }]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.post('/', { Key: 'Value' }, port);

                assert.strictEqual(response.body, 'SUCCESS');
            });

            it('should support predicate matching with null value (issue #262)', async function () {
                const stub = {
                        predicates: [{ equals: { body: { version: null } } }],
                        responses: [{ is: { body: 'SUCCESS' } }]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.post('/', { version: null }, port);

                assert.strictEqual(response.body, 'SUCCESS');
            });

            it('should support predicate form matching', async function () {
                const spec = {
                        path: '/',
                        port,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: 'firstname=ruud&lastname=mountebank'
                    },
                    stub = {
                        predicates: [{ deepEquals: { form: { firstname: 'ruud', lastname: 'mountebank' } } }],
                        responses: [{ is: { body: 'SUCCESS' } }]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.responseFor(spec);

                assert.strictEqual(response.body, 'SUCCESS');
            });

            it('should support predicate from gzipped request (issue #499)', async function () {
                const zlib = require('zlib'),
                    spec = {
                        path: '/',
                        port,
                        method: 'POST',
                        headers: {
                            'Content-Encoding': 'gzip'
                        },
                        mode: 'binary',
                        body: zlib.gzipSync('{"key": "value", "arr": [3,2,1]}')
                    },
                    stub = {
                        responses: [{ is: { body: 'SUCCESS' } }],
                        predicates: [
                            { equals: { body: { key: 'value' } } },
                            { equals: { body: { arr: 3 } } },
                            { deepEquals: { body: { key: 'value', arr: [2, 1, 3] } } },
                            { matches: { body: { key: '^v' } } }
                        ]
                    },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const response = await client.responseFor(spec);

                assert.strictEqual(response.body.toString(), 'SUCCESS');
            });

            it('should support overwriting the stubs without restarting the imposter', async function () {
                const stub = { responses: [{ is: { body: 'ORIGINAL' } }] },
                    request = { protocol, port, stubs: [stub] };
                await api.createImposter(request);

                const putResponse = await api.put(`/imposters/${port}/stubs`, {
                    stubs: [
                        { responses: [{ is: { body: 'FIRST' } }] },
                        { responses: [{ is: { body: 'ORIGINAL' } }] },
                        { responses: [{ is: { body: 'THIRD' } }] }
                    ]
                });
                assert.strictEqual(putResponse.statusCode, 200);
                assert.deepEqual(putResponse.body.stubs, [
                    {
                        responses: [{ is: { body: 'FIRST' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/0` } }
                    },
                    {
                        responses: [{ is: { body: 'ORIGINAL' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/1` } }
                    },
                    {
                        responses: [{ is: { body: 'THIRD' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/2` } }
                    }
                ]);

                const getResponse = await client.get('/', port);
                assert.strictEqual(getResponse.body, 'FIRST');
            });

            it('should support overwriting a single stub without restarting the imposter', async function () {
                const request = {
                        protocol,
                        port,
                        stubs: [
                            { responses: [{ is: { body: 'first' } }], predicates: [{ equals: { path: '/first' } }] },
                            { responses: [{ is: { body: 'SECOND' } }] },
                            { responses: [{ is: { body: 'third' } }] }
                        ]
                    },
                    changedStub = { responses: [{ is: { body: 'CHANGED' } }] };
                await api.createImposter(request);

                const putResponse = await api.put(`/imposters/${port}/stubs/1`, changedStub);
                assert.strictEqual(putResponse.statusCode, 200, JSON.stringify(putResponse.body));
                assert.deepEqual(putResponse.body.stubs, [
                    {
                        responses: [{ is: { body: 'first' } }],
                        predicates: [{ equals: { path: '/first' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/0` } }
                    },
                    {
                        responses: [{ is: { body: 'CHANGED' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/1` } }
                    },
                    {
                        responses: [{ is: { body: 'third' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/2` } }
                    }
                ]);

                const getResponse = await client.get('/', port);
                assert.strictEqual(getResponse.body, 'CHANGED');
            });

            it('should support deleting single stub without restarting the imposter', async function () {
                const request = {
                    protocol,
                    port,
                    stubs: [
                        { responses: [{ is: { body: 'first' } }], predicates: [{ equals: { path: '/first' } }] },
                        { responses: [{ is: { body: 'SECOND' } }] },
                        { responses: [{ is: { body: 'third' } }] }
                    ]
                };
                await api.createImposter(request);

                const deleteResponse = await api.del(`/imposters/${port}/stubs/1`);
                assert.strictEqual(deleteResponse.statusCode, 200);
                assert.deepEqual(deleteResponse.body.stubs, [
                    {
                        responses: [{ is: { body: 'first' } }], predicates: [{ equals: { path: '/first' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/0` } }
                    },
                    {
                        responses: [{ is: { body: 'third' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/1` } }
                    }
                ]);

                const getResponse = await client.get('/', port);
                assert.strictEqual(getResponse.body, 'third');
            });

            it('should support adding single stub without restarting the imposter', async function () {
                const request = {
                        protocol,
                        port,
                        stubs: [
                            { responses: [{ is: { body: 'first' } }], predicates: [{ equals: { path: '/first' } }] },
                            { responses: [{ is: { body: 'third' } }] }
                        ]
                    },
                    newStub = { responses: [{ is: { body: 'SECOND' } }] };
                await api.createImposter(request);

                const postResponse = await api.post(`/imposters/${port}/stubs`, { index: 1, stub: newStub });
                assert.strictEqual(postResponse.statusCode, 200);
                assert.deepEqual(postResponse.body.stubs, [
                    {
                        responses: [{ is: { body: 'first' } }], predicates: [{ equals: { path: '/first' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/0` } }
                    },
                    {
                        responses: [{ is: { body: 'SECOND' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/1` } }
                    },
                    {
                        responses: [{ is: { body: 'third' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/2` } }
                    }
                ]);

                const getResponse = await client.get('/', port);
                assert.strictEqual(getResponse.body, 'SECOND');
            });

            it('should support adding single stub at end without index ', async function () {
                const request = {
                        protocol,
                        port,
                        stubs: [
                            { responses: [{ is: { body: 'first' } }], predicates: [{ equals: { path: '/first' } }] },
                            { responses: [{ is: { body: 'third' } }] }
                        ]
                    },
                    newStub = { responses: [{ is: { body: 'LAST' } }] };
                await api.createImposter(request);

                const postResponse = await api.post(`/imposters/${port}/stubs`, { stub: newStub });
                assert.strictEqual(postResponse.statusCode, 200);
                assert.deepEqual(postResponse.body.stubs, [
                    {
                        responses: [{ is: { body: 'first' } }], predicates: [{ equals: { path: '/first' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/0` } }
                    },
                    {
                        responses: [{ is: { body: 'third' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/1` } }
                    },
                    {
                        responses: [{ is: { body: 'LAST' } }],
                        _links: { self: { href: `${api.url}/imposters/${port}/stubs/2` } }
                    }
                ]);

                const getResponse = await client.get('/', port);
                assert.strictEqual(getResponse.body, 'third');
            });

            it('should support matching cirillic characters (issue #477)', async function () {
                const request = {
                    port,
                    protocol,
                    stubs: [{
                        predicates: [{ deepEquals: { body: { тест: '2' } } }],
                        responses: [{ is: { body: 'Matched' } }]
                    }]
                };
                await api.createImposter(request);

                const response = await client.post('/', '{ "тест": "2" }', port);

                assert.strictEqual(response.body, 'Matched');
            });
        });
    });
});
