'use strict';

var http = require('http'),
    Q = require('q'),
    Domain = require('domain'),
    StubRepository = require('./stubRepository'),
    Proxy = require('./proxy'),
    Validator = require('./httpValidator');

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

        var domain = Domain.create(),
            errorHandler = function (error) {
                console.log(logPrefix + 'ERROR: ' + JSON.stringify(error));
                response.writeHead(500, { 'content-type': 'application/json' });
                response.end(JSON.stringify({ errors: [error] }), 'utf8');
            };

        domain.on('error', errorHandler);

        domain.run(function () {
            simplify(request).then(function (simpleRequest) {
                requests.push(simpleRequest);
                return stubs.resolve(simpleRequest);
            }).done(function (stubResponse) {
                response.writeHead(stubResponse.statusCode, stubResponse.headers);
                response.end(stubResponse.body.toString(), 'utf8');
            }, errorHandler);
        });
    });

    server.on('close', function () {
        console.log(logPrefix + 'Ciao for now');
    });

    server.listen(port, function () {
        console.log(logPrefix + 'Open for business...');
        deferred.resolve({
            requests: requests,
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
    create: create,
    Validator: Validator
};
