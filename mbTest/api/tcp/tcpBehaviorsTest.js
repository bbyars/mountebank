'use strict';

const assert = require('assert'),
    api = require('../../api').create(),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    tcp = require('./tcpClient'),
    fs = require('fs-extra');

describe('tcp imposter', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await api.del('/imposters');
    });

    describe('POST /imposters with stubs', function () {
        it('should support decorating response from origin server', async function () {
            const originServerPort = port + 1,
                originServerStub = { responses: [{ is: { data: 'ORIGIN' } }] },
                originServerRequest = {
                    protocol: 'tcp',
                    port: originServerPort,
                    stubs: [originServerStub],
                    name: 'ORIGIN'
                },
                decorator = (request, response) => {
                    response.data += ' DECORATED';
                },
                proxyResponse = {
                    proxy: { to: 'tcp://localhost:' + originServerPort },
                    _behaviors: { decorate: decorator.toString() }
                },
                proxyStub = { responses: [proxyResponse] },
                proxyRequest = { protocol: 'tcp', port, stubs: [proxyStub], name: 'PROXY' };
            await api.createImposter(originServerRequest);
            await api.createImposter(proxyRequest);

            const response = await tcp.send('request', port);

            assert.strictEqual(response.toString(), 'ORIGIN DECORATED');
        });

        it('should compose multiple behaviors together', async function () {
            const shellFn = function exec () {
                    console.log(process.argv[3].replace('${SALUTATION}', 'Hello'));
                },
                decorator = (request, response) => {
                    response.data = response.data.replace('${SUBJECT}', 'mountebank');
                },
                stub = {
                    responses: [
                        {
                            is: { data: '${SALUTATION}, ${SUBJECT}${PUNCTUATION}' },
                            _behaviors: {
                                wait: 300,
                                repeat: 2,
                                shellTransform: [`node ${process.cwd()}/shellTransformTest.js`],
                                decorate: decorator.toString(),
                                copy: [{
                                    from: 'data',
                                    into: '${PUNCTUATION}',
                                    using: { method: 'regex', selector: '[,.?!]' }
                                }]
                            }
                        },
                        {
                            is: { data: 'No behaviors' }
                        }
                    ]
                },
                stubs = [stub],
                request = { protocol: 'tcp', port, stubs: stubs };
            await api.createImposter(request);
            fs.writeFileSync('shellTransformTest.js', `${shellFn.toString()}\nexec();`);

            try {
                const firstStart = new Date(),
                    firstResponse = await tcp.send('!', port),
                    firstTime = new Date() - firstStart;
                assert.strictEqual(firstResponse.toString(), 'Hello, mountebank!');
                assert.ok(firstTime >= 250, 'actual time: ' + firstTime);

                const secondStart = new Date(),
                    secondResponse = await tcp.send('!', port),
                    secondTime = new Date() - secondStart;
                assert.strictEqual(secondResponse.toString(), 'Hello, mountebank!');
                assert.ok(secondTime >= 250, 'actual time: ' + secondTime);

                const third = await tcp.send('!', port);
                assert.strictEqual(third.toString(), 'No behaviors');
            }
            finally {
                fs.unlinkSync('shellTransformTest.js');
            }
        });
    });
});
