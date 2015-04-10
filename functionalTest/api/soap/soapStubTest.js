'use strict';

var assert = require('assert'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.SLOW_TEST_TIMEOUT_MS || 2000),
    http = require('../http/baseHttpClient').create('http');

describe('soap imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with stubs', function () {
        promiseIt('should default to 202 response and one way message exchange pattern and record method name and parameters', function () {
            var request = { protocol: 'soap', port: port, name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                var body = '<?xml version="1.0"?>\n' +
                           '<soap-env:Envelope\n' +
                           ' xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"\n' +
                           ' soap-env:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n' +
                           '   <soap-env:Body>\n' +
                           '       <m:GetLastTradePrice xmlns:m="Some-URI">\n' +
                           '           <symbol>DIS</symbol>\n' +
                           '       </m:GetLastTradePrice>\n' +
                           '   </soap-env:Body>\n' +
                           '</soap-env:Envelope>';
                return http.responseFor({
                    method: 'POST',
                    path: '/StockQuote',
                    port: port,
                    headers: {
                        'content-type': 'text/xml; charset="utf-8"',
                        SOAPAction: '"Some-URI"'
                    },
                    body: body
                });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 202);
                assert.strictEqual(response.body, '');

                return api.get('/imposters/' + port);
            }).then(function (response) {
                assert.strictEqual(1, response.body.requests.length);

                var request = response.body.requests[0];
                assert.strictEqual('GetLastTradePrice', request.method);
                assert.deepEqual({ symbol: 'DIS' }, request.parameters);
                assert.strictEqual('POST', request.http.method);
                assert.strictEqual('/StockQuote', request.http.path);
            }).finally(function () {
                return api.del('/imposters');
            });
        });
    });
});
