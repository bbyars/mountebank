'use strict';

var assert = require('assert'),
    SoapRequest = require('../../../src/models/soap/soapRequest'),
    promiseIt = require('../../testHelpers').promiseIt,
    events = require('events'),
    mock = require('../../mock').mock,
    inherit = require('../../../src/util/inherit');

describe('SoapRequest', function () {
    describe('#createFrom', function () {
        var httpRequest,
            defaultBody = '<?xml version="1.0"?>\n' +
                          '<soap-env:Envelope\n' +
                          ' xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"\n' +
                          ' soap-env:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n' +
                          '   <soap-env:Body>\n' +
                          '       <m:GetLastTradePrice xmlns:m="Some-URI">\n' +
                          '           <symbol>DIS</symbol>\n' +
                          '       </m:GetLastTradePrice>\n' +
                          '   </soap-env:Body>\n' +
                          '</soap-env:Envelope>';

        beforeEach(function () {
            httpRequest = inherit.from(events.EventEmitter, {
                socket: { remoteAddress: '', remotePort: '' },
                setEncoding: mock(),
                url: 'http://localhost/'
            });
        });

        promiseIt('should set requestFrom from socket information', function () {
            httpRequest.socket = { remoteAddress: 'HOST', remotePort: 'PORT' };

            var promise = SoapRequest.createFrom(httpRequest).then(function (soapRequest) {
                    assert.strictEqual(soapRequest.requestFrom, 'HOST:PORT');
                });

            httpRequest.emit('data', defaultBody);
            httpRequest.emit('end');

            return promise;
        });

        promiseIt('should echo method and headers from original request', function () {
            httpRequest.method = 'METHOD';
            httpRequest.headers = 'HEADERS';

            var promise = SoapRequest.createFrom(httpRequest).then(function (soapRequest) {
                    assert.strictEqual(soapRequest.method, 'METHOD');
                    assert.strictEqual(soapRequest.headers, 'HEADERS');
                });

            httpRequest.emit('data', defaultBody);
            httpRequest.emit('end');

            return promise;
        });

        promiseIt('should set path and query from request url', function () {
            httpRequest.url = 'http://localhost/path?key=value';

            var promise = SoapRequest.createFrom(httpRequest).then(function (soapRequest) {
                    assert.strictEqual(soapRequest.path, '/path');
                    assert.deepEqual(soapRequest.query, { key: 'value' });
                });

            httpRequest.emit('data', defaultBody);
            httpRequest.emit('end');

            return promise;
        });

        promiseIt('should set body from data events', function () {
            var promise = SoapRequest.createFrom(httpRequest).then(function (soapRequest) {
                    assert.strictEqual(soapRequest.body, defaultBody);
                });

            httpRequest.emit('data', defaultBody);
            httpRequest.emit('end');

            return promise;
        });

        promiseIt('should set operation from xml', function () {
            var body = '<?xml version="1.0"?>\n' +
                        '<soap-env:Envelope\n' +
                        ' xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"\n' +
                        ' soap-env:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n' +
                        '   <soap-env:Body>\n' +
                        '       <m:GetLastTradePrice xmlns:m="Some-URI">\n' +
                        '           <symbol>DIS</symbol>\n' +
                        '       </m:GetLastTradePrice>\n' +
                        '   </soap-env:Body>\n' +
                        '</soap-env:Envelope>',
                promise = SoapRequest.createFrom(httpRequest).then(function (soapRequest) {
                        assert.strictEqual(soapRequest.operation, 'GetLastTradePrice');
                    });

            httpRequest.emit('data', body);
            httpRequest.emit('end');

            return promise;
        });

        promiseIt('should set operation from xml with different namespace prefix', function () {
            var body = '<?xml version="1.0"?>\n' +
                        '<soap:Envelope\n' +
                        ' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"\n' +
                        ' soap:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n' +
                        '   <soap:Body>\n' +
                        '       <m:GetLastTradePrice xmlns:m="Some-URI">\n' +
                        '           <symbol>DIS</symbol>\n' +
                        '       </m:GetLastTradePrice>\n' +
                        '   </soap:Body>\n' +
                        '</soap:Envelope>',
                promise = SoapRequest.createFrom(httpRequest).then(function (soapRequest) {
                        assert.strictEqual(soapRequest.operation, 'GetLastTradePrice');
                    });

            httpRequest.emit('data', body);
            httpRequest.emit('end');

            return promise;
        });
    });
});
