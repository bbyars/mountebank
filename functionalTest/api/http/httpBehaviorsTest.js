'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    BaseHttpClient = require('./baseHttpClient'),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    fs = require('fs-extra');

['http', 'https'].forEach(protocol => {
    const client = BaseHttpClient.create(protocol);

    describe(`${protocol} imposter`, function () {
        this.timeout(timeout);

        afterEach(async function () {
            await api.del('/imposters');
        });

        describe('POST /imposters with stubs', function () {
            it('should add latency when using behaviors.wait', async function () {
                const stub = {
                        responses: [{
                            is: { body: 'stub' },
                            _behaviors: { wait: 1000 }
                        }]
                    },
                    stubs = [stub],
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const start = new Date(),
                    response = await client.get('/', port),
                    time = new Date() - start;

                assert.strictEqual(response.body, 'stub');
                assert.ok(time >= 990, `actual time: ${time}`); // Occasionally there's some small inaccuracies
            });

            it('should add latency when using behaviors.wait as a function', async function () {
                const fn = () => 1000,
                    stub = {
                        responses: [{
                            is: { body: 'stub' },
                            _behaviors: { wait: fn.toString() }
                        }]
                    },
                    stubs = [stub],
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const start = new Date(),
                    response = await client.get('/', port),
                    time = new Date() - start;

                assert.strictEqual(response.body, 'stub');
                assert.ok(time >= 990, `actual time: ${time}`); // Occasionally there's some small inaccuracies
            });

            it('should support post-processing when using behaviors.decorate (old interface)', async function () {
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
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const response = await client.get('/', port);

                assert.strictEqual(response.body, `the year is ${new Date().getFullYear()}`);
            });

            it('should support post-processing when using behaviors.decorate', async function () {
                const decorator = config => {
                        config.response.body = config.response.body.replace('${YEAR}', new Date().getFullYear());
                    },
                    stub = {
                        responses: [{
                            is: { body: 'the year is ${YEAR}' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const response = await client.get('/', port);

                assert.strictEqual(response.body, `the year is ${new Date().getFullYear()}`);
            });

            it('should fix content-length if set and adjusted using decoration (issue #155)', async function () {
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
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const response = await client.get('/', port);

                assert.strictEqual(response.body, 'length-8');
                assert.strictEqual(response.headers['content-length'], '8');
            });

            it('should support using request parameters during decorating (old interface)', async function () {
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
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const response = await client.get('/test', port);

                assert.strictEqual(response.body, 'the path is /test');
            });

            it('should support using request parameters during decorating', async function () {
                const decorator = config => {
                        config.response.body = config.response.body.replace('${PATH}', config.request.path);
                    },
                    stub = {
                        responses: [{
                            is: { body: 'the path is ${PATH}' },
                            _behaviors: { decorate: decorator.toString() }
                        }]
                    },
                    stubs = [stub],
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const response = await client.get('/test', port);

                assert.strictEqual(response.body, 'the path is /test');
            });

            it('should support using request parameters during decorating multiple times (issue #173)', async function () {
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
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const first = await client.get('/test?id=100', port);
                assert.strictEqual(first.body, 'request 100');

                const second = await client.get('/test?id=200', port);
                assert.strictEqual(second.body, 'request 200');

                const third = await client.get('/test?id=300', port);
                assert.strictEqual(third.body, 'request 300');
            });

            it('should support decorate functions that return a value (old interface)', async function () {
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
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const response = await client.get('/', port);

                assert.strictEqual(response.body, 'This is a clone');
            });

            it('should support decorate functions that return a value', async function () {
                const decorator = config => {
                        const clonedResponse = JSON.parse(JSON.stringify(config.response));
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
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const response = await client.get('/', port);

                assert.strictEqual(response.body, 'This is a clone');
            });

            it('should not validate the decorate JavaScript function', async function () {
                const decorator = "response.body = 'This should not work';",
                    stub = {
                        responses: [{
                            is: { body: 'This is the original' },
                            _behaviors: { decorate: decorator }
                        }]
                    },
                    stubs = [stub],
                    imposter = { protocol, port, stubs: stubs };

                const response = await api.createImposter(imposter);

                assert.strictEqual(response.statusCode, 201);
            });

            it('should repeat if behavior set and loop around responses with same repeat behavior (issue #165)', async function () {
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
                    imposter = { protocol, port, stubs: [stub] };
                await api.createImposter(imposter);

                const first = await client.get('/', port);
                assert.strictEqual(first.statusCode, 400);
                assert.strictEqual(first.body, 'first response');

                const second = await client.get('/', port);
                assert.strictEqual(second.body, 'first response');

                const third = await client.get('/', port);
                assert.strictEqual(third.body, 'second response');

                const fourth = await client.get('/', port);
                assert.strictEqual(fourth.body, 'second response');

                const fifth = await client.get('/', port);
                assert.strictEqual(fifth.body, 'second response');

                const sixth = await client.get('/', port);
                assert.strictEqual(sixth.body, 'third response');

                const seventh = await client.get('/', port);
                assert.strictEqual(seventh.body, 'first response');

                const eighth = await client.get('/', port);
                assert.strictEqual(eighth.body, 'first response');
            });

            it('should repeat consistently with headers (issue #158)', async function () {
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
                    imposter = { protocol, port, stubs: [stub] };
                await api.createImposter(imposter);

                const first = await client.get('/', port);
                assert.deepEqual(first.body, 'first response', 'first try');

                const second = await client.get('/', port);
                assert.deepEqual(second.body, 'first response', 'second try');

                const third = await client.get('/', port);
                assert.deepEqual(third.body, 'second response', 'third try');
            });

            it('should repeat with JSON key of repeat (issue #237)', async function () {
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
                    imposter = { protocol, port, stubs: [stub] };
                await api.createImposter(imposter);

                const first = await client.post('/', { repeat: true }, port);
                assert.deepEqual(first.body, 'This should repeat 2 times', 'first try');

                const second = await client.post('/', { repeat: true }, port);
                assert.deepEqual(second.body, 'This should repeat 2 times', 'second try');

                const third = await client.post('/', { repeat: true }, port);
                assert.deepEqual(third.body, 'Then you should see this', 'third try');
            });

            it('should support shell transform without array for backwards compatibility', async function () {
                // The string version of the shellTransform behavior is left for backwards
                // compatibility. It changed in v1.13.0 to accept an array.
                const stub = {
                        responses: [{
                            is: { body: 'Hello, {YOU}!' },
                            _behaviors: { shellTransform: 'node shellTransformTest.js' }
                        }]
                    },
                    stubs = [stub],
                    imposter = { protocol, port, stubs: stubs },
                    shellFn = function exec () {
                        console.log(process.argv[3].replace('{YOU}', 'mountebank'));
                    };
                await api.createImposter(imposter);
                fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);

                try {
                    const response = await client.get('/', port);

                    assert.strictEqual(response.body, 'Hello, mountebank!');
                }
                finally {
                    fs.unlinkSync('shellTransformTest.js');
                }
            });

            it('should support array of shell transforms in order', async function () {
                const stub = {
                        responses: [{
                            is: { body: 1 },
                            _behaviors: {
                                shellTransform: ['node double.js', 'node increment.js']
                            }
                        }]
                    },
                    stubs = [stub],
                    imposter = { protocol, port, stubs: stubs },
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
                await api.createImposter(imposter);
                fs.writeFileSync('double.js', `${doubleFn.toString()}\ndouble();`);
                fs.writeFileSync('increment.js', `${incrementFn.toString()}\nincrement();`);

                try {
                    const response = await client.get('/', port);

                    assert.strictEqual(response.body, '3');
                }
                finally {
                    fs.unlinkSync('double.js');
                    fs.unlinkSync('increment.js');
                }
            });

            it('should support copying from request fields using regex', async function () {
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
                    imposter = { protocol, port, stubs: [stub] };
                await api.createImposter(imposter);

                const response = await client.responseFor({
                    port,
                    method: 'GET',
                    headers: { 'x-request': 'header value' },
                    path: '/400/this-will-be-ignored?body=body%20is%20HERE'
                });

                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.headers['x-test'], 'header value');
                assert.strictEqual(response.body, 'HERE');
            });

            it('should support copying from request fields using xpath', async function () {
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
                    imposter = { protocol, port, stubs: [stub] };
                await api.createImposter(imposter);

                const response = await client.post('/', '<doc xmlns:mb="http://example.com/mb"><mb:name>mountebank</mb:name></doc>', port);

                assert.strictEqual(response.body, 'Hello, mountebank! Good to see you, mountebank.');
            });

            it('should support copying from request fields using jsonpath', async function () {
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
                    imposter = { protocol, port, stubs: [stub] };
                await api.createImposter(imposter);

                const response = await client.post('/', JSON.stringify({ name: 'mountebank' }), port);

                assert.strictEqual(response.body, 'Hello, mountebank! Good to see you, mountebank.');
            });

            it('should support lookup from CSV file keyed by regex', async function () {
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
                    imposter = { protocol, port, stubs: [stub] };
                await api.createImposter(imposter);
                fs.writeFileSync('lookupTest.csv',
                    'name,code,occupation,location\n' +
                    'mountebank,400,tester,worldwide\n' +
                    'Brandon,404,mountebank,Dallas\n' +
                    'Bob Barker,500,"The Price Is Right","Darrington, Washington"');

                try {
                    const response = await client.responseFor({
                        port,
                        method: 'GET',
                        headers: { 'x-bob': 'The Price Is Right' },
                        path: '/mountebank'
                    });

                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.headers['x-occupation'], 'tester');
                    assert.strictEqual(response.body, 'Hello mountebank. Have you been to Darrington, Washington?');
                }
                finally {
                    fs.unlinkSync('lookupTest.csv');
                }
            });

            it('should support lookup from CSV file keyed by xpath', async function () {
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
                    imposter = { protocol, port, stubs: [stub] };
                await api.createImposter(imposter);
                fs.writeFileSync('lookupTest.csv',
                    'name,occupation,location\n' +
                    'mountebank,tester,worldwide\n' +
                    'Brandon,mountebank,Dallas\n' +
                    'Bob Barker,"The Price Is Right","Darrington, Washington"');

                try {
                    const response = await client.post('/', '<doc xmlns:mb="http://example.com/mb"><mb:name>mountebank</mb:name></doc>', port);

                    assert.strictEqual(response.body, 'Hello, Brandon! How is Dallas today?');
                }
                finally {
                    fs.unlinkSync('lookupTest.csv');
                }
            });

            it('should support lookup from CSV file keyed by jsonpath', async function () {
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
                    imposter = { protocol, port, stubs: [stub] };
                await api.createImposter(imposter);
                fs.writeFileSync('lookupTest.csv',
                    'name,occupation,location\n' +
                    'mountebank,tester,worldwide\n' +
                    'Brandon,mountebank,Dallas\n' +
                    'Bob Barker,"The Price Is Right","Darrington, Washington"');

                try {
                    const response = await client.post('/', JSON.stringify({ occupation: 'mountebank' }), port);

                    assert.strictEqual(response.body, 'Hello, Brandon! How is Dallas today?');
                }
                finally {
                    fs.unlinkSync('lookupTest.csv');
                }
            });

            it('should compose multiple behaviors together (old interface for backwards compatibility)', async function () {
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
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);
                fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);

                try {
                    const firstStart = new Date(),
                        firstResponse = await client.get('/?punctuation=!', port),
                        firstTime = new Date() - firstStart;
                    assert.strictEqual(firstResponse.body, 'Hello, mountebank!');
                    assert.ok(firstTime >= 250, `actual time: ${firstTime}`);

                    const secondStart = new Date(),
                        secondResponse = await client.get('/?punctuation=!', port),
                        secondTime = new Date() - secondStart;
                    assert.strictEqual(secondResponse.body, 'Hello, mountebank!');
                    assert.ok(secondTime >= 250, `actual time: ${secondTime}`);

                    const thirdResponse = await client.get('/?punctuation=!', port);
                    assert.strictEqual(thirdResponse.body, 'No behaviors');
                }
                finally {
                    fs.unlinkSync('shellTransformTest.js');
                }
            });

            it('should apply behaviors in sequence', async function () {
                const first = config => {
                        config.response.body += '1';
                    },
                    second = config => {
                        config.response.body += '2';
                    },
                    third = config => {
                        config.response.body += '3';
                    },
                    stub = {
                        responses: [
                            {
                                is: { body: '' },
                                behaviors: [
                                    { decorate: first.toString() },
                                    { decorate: third.toString() },
                                    { decorate: second.toString() }
                                ]
                            }
                        ]
                    },
                    stubs = [stub],
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);

                const response = await client.get('/', port);

                assert.strictEqual(response.body, '132');
            });

            it('should apply multiple behaviors in sequence with repeat (new format)', async function () {
                const shellFn = function exec () {
                        const response = JSON.parse(process.env.MB_RESPONSE);
                        response.body += '-shellTransform';
                        console.log(JSON.stringify(response));
                    },
                    decorator = config => {
                        config.response.body += '-${decorate}';
                    },
                    stub = {
                        responses: [
                            {
                                is: { body: '' },
                                repeat: 2,
                                behaviors: [
                                    { decorate: decorator.toString() },
                                    {
                                        copy: {
                                            from: 'path',
                                            into: '${decorate}',
                                            using: { method: 'regex', selector: '.+' }
                                        }
                                    },
                                    { shellTransform: 'node ./shellTransformTest.js' },
                                    { wait: 100 },
                                    { decorate: decorator.toString() },
                                    { wait: 150 }
                                ]
                            },
                            {
                                is: { body: 'no behaviors' }
                            }
                        ]
                    },
                    stubs = [stub],
                    imposter = { protocol, port, stubs: stubs };
                await api.createImposter(imposter);
                fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);

                try {
                    const start = new Date(),
                        first = await client.get('/first', port),
                        time = new Date() - start;
                    assert.strictEqual(first.body, '-/first-shellTransform-${decorate}');
                    assert.ok(time >= 220, `actual time: ${time}`); // Occasionally there's some small inaccuracies

                    const second = await client.get('/second', port);
                    assert.strictEqual(second.body, '-/second-shellTransform-${decorate}');

                    const third = await client.get('/third', port);
                    assert.strictEqual(third.body, 'no behaviors');
                }
                finally {
                    fs.unlinkSync('shellTransformTest.js');
                }
            });
        });
    });
});
