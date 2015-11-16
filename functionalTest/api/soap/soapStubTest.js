'use strict';

var assert = require('assert'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    http = require('../http/baseHttpClient').create('http'),
    fs = require('fs'),
    path = require('path');

describe('soap imposter', function () {
    this.timeout(timeout);

    describe('POST /imposters with stubs', function () {
        promiseIt('should default to 202 response and one way message exchange pattern', function () {
            var imposterRequest = { protocol: 'soap', port: port, name: this.name };

            return api.post('/imposters', imposterRequest).then(function (response) {
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
                assert.deepEqual(request.method, { name: 'GetLastTradePrice', URI: 'Some-URI' });
                assert.deepEqual(request.parameters, { symbol: 'DIS' });
                assert.strictEqual(request.http.method, 'POST');
                assert.strictEqual(request.http.path, '/StockQuote');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should return stubbed response', function () {
            // example borrowed from the sample that ships with SOAP UI
            var wsdl = fs.readFileSync(path.join(__dirname, '/wsdl/sample-service.wsdl'), 'utf8').replace('$PORT', port),
                stub = {
                    predicates: [{
                        equals: {
                            http: {
                                method: 'POST',
                                path: '/SoapStubTest'
                            },
                            method: {
                                name: 'login'
                            },
                            parameters: {
                                username: 'user',
                                password: 'letmein'
                            }
                        }
                    }],
                    responses: [{ is: { response: { sessionid: 'SUCCESS' } } }]
                },
                request = { protocol: 'soap', wsdl: wsdl, port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                var body = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sam="http://www.soapui.org/sample/">\n' +
                    '    <soapenv:Header/>\n' +
                    '    <soapenv:Body>\n' +
                    '        <sam:login>\n' +
                    '            <username>user</username>\n' +
                    '            <password>letmein</password>\n' +
                    '        </sam:login>\n' +
                    '    </soapenv:Body>\n' +
                    '</soapenv:Envelope>';
                return http.responseFor({
                    method: 'POST',
                    path: '/SoapStubTest',
                    port: port,
                    headers: {
                        'content-type': 'text/xml; charset="utf-8"',
                        SOAPAction: '""'
                    },
                    body: body
                });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.strictEqual(response.body,
                    '<soapenv:Envelope xmlns:mb="http://www.soapui.org/sample/" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">\n' +
                    '   <soapenv:Header/>\n' +
                    '   <soapenv:Body><mb:loginResponse><sessionid>SUCCESS</sessionid></mb:loginResponse></soapenv:Body>\n' +
                    '</soapenv:Envelope>');
            }).finally(function () {
                return api.del('/imposters');
            });
        });

        promiseIt('should add default response answers', function () {
            var wsdl = fs.readFileSync(path.join(__dirname, '/wsdl/sample-service.wsdl'), 'utf8').replace('$PORT', port),
                stub = {
                    responses: [{ is: {} }]
                },
                request = { protocol: 'soap', wsdl: wsdl, port: port, stubs: [stub], name: this.name };

            return api.post('/imposters', request).then(function (response) {
                assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body));

                var body = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sam="http://www.soapui.org/sample/">\n' +
                    '    <soapenv:Header/>\n' +
                    '    <soapenv:Body>\n' +
                    '        <sam:login>\n' +
                    '            <username>user</username>\n' +
                    '            <password>letmein</password>\n' +
                    '        </sam:login>\n' +
                    '    </soapenv:Body>\n' +
                    '</soapenv:Envelope>';
                return http.responseFor({
                    method: 'POST',
                    path: '/SoapStubTest',
                    port: port,
                    headers: {
                        'content-type': 'text/xml; charset="utf-8"',
                        SOAPAction: '""'
                    },
                    body: body
                });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.strictEqual(response.body,
                    '<soapenv:Envelope xmlns:mb="http://www.soapui.org/sample/" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">\n' +
                    '   <soapenv:Header/>\n' +
                    '   <soapenv:Body><mb:loginResponse><sessionid></sessionid></mb:loginResponse></soapenv:Body>\n' +
                    '</soapenv:Envelope>');
            }).finally(function () {
                return api.del('/imposters');
            });
        });
        it('should handle multiple services in the WSDL');
        it('should handle multiple ports in the WSDL');
        it('should handle complex types');
    });
});
