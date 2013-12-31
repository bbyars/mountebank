'use strict';

var Q = require('q'),
    Domain = require('domain'),
    StubRepository = require('../stubRepository'),
    Proxy = require('./httpProxy'),
    DryRunValidator = require('../dryRunValidator'),
    winston = require('winston'),
    ScopedLogger = require('../../util/scopedLogger'),
    util = require('util'),
    HttpRequest = require('./httpRequest');

function setup (protocolName, createServer) {
    function postProcess (stub) {
        var response = {
            statusCode: stub.statusCode || 200,
            headers: stub.headers || {},
            body: stub.body || ''
        };

        // We don't want to use keepalive connections, because a test case
        // may shutdown the stub, which prevents new connections for
        // the port, but that won't prevent the system under test
        // from reusing an existing TCP connection after the stub
        // has shutdown, causing difficult to track down bugs when
        // multiple tests are run.
        response.headers.connection = 'close';
        return response;
    }

    var create = function (port, options) {
        var name = options.name ? util.format('%s:%s %s', protocolName, port, options.name) : protocolName + ':' + port,
            logger = ScopedLogger.create(winston, name),
            deferred = Q.defer(),
            requests = [],
            proxy = Proxy.create(logger),
            stubs = StubRepository.create(proxy, logger, postProcess),
            server = createServer(),
            requestListener = function (request, response) {
                var clientName = request.socket.remoteAddress + ':' + request.socket.remotePort,
                    domain = Domain.create(),
                    errorHandler = function (error) {
                        logger.error(JSON.stringify(error));
                        response.writeHead(500, { 'content-type': 'application/json' });
                        response.end(JSON.stringify({ errors: [error] }), 'utf8');
                    };

                logger.info('%s => %s %s', clientName, request.method, request.url);

                domain.on('error', errorHandler);

                domain.run(function () {
                    HttpRequest.createFrom(request).then(function (httpRequest) {
                        logger.debug('%s => %s', clientName, JSON.stringify(httpRequest));
                        requests.push(httpRequest);
                        return stubs.resolve(httpRequest);
                    }).done(function (stubResponse) {
                            logger.debug('%s <= %s', clientName, JSON.stringify(stubResponse));
                            response.writeHead(stubResponse.statusCode, stubResponse.headers);
                            response.end(stubResponse.body.toString(), 'utf8');
                        }, errorHandler);
                });
            };

        server.on('request', requestListener);
        server.on('connection', function (socket) {
            logger.debug('%s:%s connected', socket.remoteAddress, socket.remotePort);
        });

        server.listen(port, function () {
            logger.info('Open for business...');
            deferred.resolve({
                requests: requests,
                addStub: stubs.addStub,
                metadata: {},
                close: function () { server.close(function () { logger.info('Ciao for now'); }); }
            });
        });

        return deferred.promise;
    };

    function initialize (allowInjection) {
        return {
            name: protocolName,
            create: create,
            Validator: {
                create: function () {
                    return DryRunValidator.create(StubRepository, HttpRequest.createTestRequest(), allowInjection);
                }
            }
        };
    }

    return {
        initialize: initialize
    };
}

module.exports = {
    setup: setup
};
