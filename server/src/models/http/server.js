'use strict';

var http = require('http'),
    Q = require('q'),
    StubRepository = require('./stubRepository');

function simplify (request) {
    var deferred = Q.defer();
    request.body = '';
    request.setEncoding('utf8');

    request.on('data', function (chunk) {
        request.body += chunk;
    });

    request.on('end', function () {
        deferred.resolve({
            path: request.url,
            method: request.method,
            headers: request.headers,
            body: request.body
        });
    });
    return deferred.promise;
}

var create = function (port) {
    var logPrefix = '[http/' + port + '] ',
        deferred = Q.defer(),
        requests = [],
        stubs = StubRepository.create();

    var server = http.createServer(function (request, response) {
        console.log(logPrefix + request.method + ' ' + request.url);

        simplify(request).then(function (simpleRequest) {
            requests.push(simpleRequest);
            var stubResponse = stubs.resolve(simpleRequest);
            response.writeHead(stubResponse.statusCode, stubResponse.headers);
            response.end(stubResponse.body, 'utf8');
        });
    });

    server.on('close', function () {
        console.log(logPrefix + 'Ciao for now');
    });

    server.listen(port, function () {
        console.log(logPrefix + 'Open for business...');
        deferred.resolve({
            requests: requests,
            isValidStubRequest: stubs.isValidStubRequest,
            stubRequestErrorsFor: stubs.stubRequestErrorsFor,
            addStub: stubs.addStub,
            close: function () {
                server.close();
            }
        });
    });

    return deferred.promise;
};

module.exports = {
    name: 'http',
    create: create
};
