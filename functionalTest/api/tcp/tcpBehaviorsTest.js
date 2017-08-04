'use strict';

var assert = require('assert'),
    api = require('../api').create(),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    tcp = require('./tcpClient'),
    fs = require('fs'),
    util = require('util');

describe('tcp imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with stubs', function () {
        promiseIt('should support decorating response from origin server', function () {
            var originServerPort = port + 1,
                originServerStub = { responses: [{ is: { data: 'ORIGIN' } }] },
                originServerRequest = {
                    protocol: 'tcp',
                    port: originServerPort,
                    stubs: [originServerStub],
                    name: this.name + ' ORIGIN'
                },
                decorator = function (request, response) {
                    response.data += ' DECORATED';
                },
                proxyResponse = {
                    proxy: { to: 'tcp://localhost:' + originServerPort },
                    _behaviors: { decorate: decorator.toString() }
                },
                proxyStub = { responses: [proxyResponse] },
                proxyRequest = { protocol: 'tcp', port: port, stubs: [proxyStub], name: this.name + ' PROXY' };

            return api.post('/imposters', originServerRequest).then(function () {
                return api.post('/imposters', proxyRequest);
            }).then(function () {
                return tcp.send('request', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'ORIGIN DECORATED');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should compose multiple behaviors together', function () {
            var shellFn = function exec () {
                    console.log(process.argv[3].replace('${SALUTATION}', 'Hello'));
                },
                decorator = function (request, response) {
                    response.data = response.data.replace('${SUBJECT}', 'mountebank');
                },
                stub = {
                    responses: [
                        {
                            is: { data: '${SALUTATION}, ${SUBJECT}${PUNCTUATION}' },
                            _behaviors: {
                                wait: 300,
                                repeat: 2,
                                shellTransform: ['node shellTransformTest.js'],
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
                request = { protocol: 'tcp', port: port, stubs: stubs, name: this.name },
                timer = new Date();

            fs.writeFileSync('shellTransformTest.js', util.format('%s\nexec();', shellFn.toString()));

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                return tcp.send('!', port);
            }).then(function (response) {
                var time = new Date() - timer;
                assert.strictEqual(response.toString(), 'Hello, mountebank!');
                assert.ok(time >= 250, 'actual time: ' + time);
                return tcp.send('!', port);
            }).then(function (response) {
                var time = new Date() - timer;
                assert.strictEqual(response.toString(), 'Hello, mountebank!');
                assert.ok(time >= 250, 'actual time: ' + time);
                return tcp.send('!', port);
            }).then(function (response) {
                assert.strictEqual(response.toString(), 'No behaviors');
            }).finally(function () {
                fs.unlinkSync('shellTransformTest.js');
                return api.del('/imposters');
            });
        });
    });
});
