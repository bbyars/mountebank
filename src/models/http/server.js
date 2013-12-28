'use strict';

var http = require('http'),
    Q = require('q'),
    Domain = require('domain'),
    StubRepository = require('./stubRepository'),
    Proxy = require('./proxy'),
    HttpValidator = require('./httpValidator'),
    winston = require('winston'),
    ScopedLogger = require('../../util/scopedLogger'),
    url = require('url');

function simplify (request) {
    var deferred = Q.defer();
    request.body = '';
    request.setEncoding('utf8');

    request.on('data', function (chunk) {
        request.body += chunk;
    });

    request.on('end', function () {
        var parts = url.parse(request.url, true);
        deferred.resolve({
            method: request.method,
            path: parts.pathname,
            query: parts.query,
            headers: request.headers,
            body: request.body
        });
    });
    return deferred.promise;
}

var create = function (port) {
    var logger = ScopedLogger.create(winston, 'http', port),
        deferred = Q.defer(),
        requests = [],
        stubs = StubRepository.create(Proxy.create()),
        server = http.createServer(function (request, response) {
            logger.info('%s %s', request.method, request.url);

            var domain = Domain.create(),
                errorHandler = function (error) {
                    logger.error(JSON.stringify(error));
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
        logger.info('Ciao for now');
    });

    server.listen(port, function () {
        logger.info('Open for business...');
        deferred.resolve({
            requests: requests,
            addStub: stubs.addStub,
            metadata: {},
            close: function () {
                server.close();
            }
        });
    });

    return deferred.promise;
};

function initialize (allowInjection) {
    return {
        name: 'http',
        create: create,
        Validator: {
            create: function () {
                return HttpValidator.create(allowInjection);
            }
        }
    };
}

module.exports = {
    initialize: initialize
};
