'use strict';

var http = require('http'),
    Q = require('q'),
    StubRepository = require('./stubRepository'),
    Proxy = require('./proxy');

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
        stubs = StubRepository.create(Proxy.create());

    var server = http.createServer(function (request, response) {
        console.log(logPrefix + request.method + ' ' + request.url);

        simplify(request).done(function (simpleRequest) {
            requests.push(simpleRequest);
            stubs.resolve(simpleRequest).done(function (stubResponse) {
                response.writeHead(stubResponse.statusCode, stubResponse.headers);
                response.end(stubResponse.body, 'utf8');
            }, function (error) {
                console.log(logPrefix + 'ERROR: ' + error);
                response.writeHead(500);
                response.end(error, 'utf8');
            });
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
