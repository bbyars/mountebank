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
        promiseIt('should return stubbed response', function () {
            // example 1 from spec: http://www.w3.org/TR/2000/NOTE-SOAP-20000508/#_Ref477488396
            var stub = {
                    predicates: [{
                        equals: {
                            path: '/StockQuote' //,
                            //operation: 'GetLastTradePrice',
                            //arguments: { StockName: 'DIS' }
                        }
                    }],
                    responses: [{ is: { response: { Price: 34.5 } } }]
                },
                request = { protocol: 'soap', port: port, stubs: [stub], name: this.name };

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
                    }
                }, body);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.strictEqual(response.body,
                    '<?xml version="1.0"?>\n' +
                    '<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/" soap-env:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"/>\n' +
                    '   <soap-env:Body>\n' +
                    '       <m:GetLastTradePriceResponse xmlns:m="Some-URI">\n' +
                    '           <Price>34.5</Price>\n' +
                    '       </m:GetLastTradePriceResponse>\n' +
                    '   </soap-env:Body>\n' +
                    '</soap-env:Envelope>');
            }).finally(function () {
                return api.del('/imposters');
            });
        });
    });
});
