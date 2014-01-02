'use strict';

var AbstractServer = require('../abstractServer'),
    Q = require('q'),
    logger = require('winston'),
    inherit = require('../../util/inherit'),
    helpers = require('../../util/helpers'),
    combinators = require('../../util/combinators'),
    StubRepository = require('../stubRepository'),
    Proxy = require('./httpProxy'),
    DryRunValidator = require('../dryRunValidator'),
    events = require('events'),
    HttpRequest = require('./httpRequest');

function setup (protocolName, createNodeServer) {
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

    function createServer (logger) {
        var proxy = Proxy.create(logger),
            stubs = StubRepository.create(proxy, postProcess),
            result = inherit.from(events.EventEmitter, {
                errorHandler: function (error, container) {
                    container.response.writeHead(500, { 'content-type': 'application/json' });
                    container.response.end(JSON.stringify({ errors: [error] }), 'utf8');
                },
                formatRequestShort: function (container) {
                    return container.request.method + ' ' + container.request.url;
                },
                formatRequest: combinators.identity,
                formatResponse: combinators.identity,
                respond: function (httpRequest, container) {
                    var scopedLogger = logger.withScope(helpers.socketName(container.request.socket));

                    return stubs.resolve(httpRequest, scopedLogger).then(function (stubResponse) {
                        container.response.writeHead(stubResponse.statusCode, stubResponse.headers);
                        container.response.end(stubResponse.body.toString(), 'utf8');
                        return stubResponse;
                    });
                },
                metadata: combinators.constant({}),
                addStub: stubs.addStub
            }),
            server = createNodeServer();

        server.on('connection', function (socket) { result.emit('connection', socket); });

        server.on('request', function (request, response) {
            var container = { request: request, response: response };
            result.emit('request', request.socket, container);
        });

        result.close = function () { server.close(); };

        result.listen = function (port) {
            var deferred = Q.defer();
            server.listen(port, function () { deferred.resolve(); });
            return deferred.promise;
        };

        return result;
    }

    function initialize (allowInjection) {
        var implementation = {
                protocolName: protocolName,
                createServer: createServer,
                Request: HttpRequest
            };

        return {
            name: protocolName,
            create: AbstractServer.implement(implementation, logger).create,
            Validator: {
                create: function () {
                    return DryRunValidator.create({
                        StubRepository: StubRepository,
                        testRequest: HttpRequest.createTestRequest(),
                        allowInjection: allowInjection
                    });
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
