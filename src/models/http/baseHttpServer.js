'use strict';

/**
 * The base implementation of http/s servers
 * @module
 */

var AbstractServer = require('../abstractServer'),
    Q = require('q'),
    winston = require('winston'),
    inherit = require('../../util/inherit'),
    helpers = require('../../util/helpers'),
    combinators = require('../../util/combinators'),
    StubRepository = require('../stubRepository'),
    ResponseResolver = require('../responseResolver'),
    HttpProxy = require('./httpProxy'),
    DryRunValidator = require('../dryRunValidator'),
    events = require('events'),
    HttpRequest = require('./httpRequest');

/**
 * Sets up the creation method for the given protocol
 * @param {string} protocolName - http or https
 * @param {Function} createBaseServer - The function to create the http or https server
 * @returns {Object}
 */
function setup (protocolName, createBaseServer) {
    function postProcess (stubResponse) {
        var response = {
            statusCode: stubResponse.statusCode || 200,
            headers: stubResponse.headers || {},
            body: stubResponse.body || '',
            _mode: stubResponse._mode || 'text'
        };

        if (typeof response.body === 'object') {
            // Support JSON response bodies
            response.body = JSON.stringify(response.body, null, 4);
        }

        // We don't want to use keepalive connections, because a test case
        // may shutdown the stub, which prevents new connections for
        // the port, but that won't prevent the system under test
        // from reusing an existing TCP connection after the stub
        // has shutdown, causing difficult to track down bugs when
        // multiple tests are run.
        if (response.headers.connection) {
            response.headers.connection = 'close';
        }
        else {
            response.headers.Connection = 'close';
        }
        return response;
    }

    /**
     * Creates the http/s server, opening up the socket
     * @memberOf module:models/http/baseHttpServer#
     * @param {Object} logger - The logger
     * @param {Object} options - Creation options
     * @returns {Object}
     */
    function createServer (logger, options) {
        var proxy = HttpProxy.create(logger),
            resolver = ResponseResolver.create(proxy, postProcess),
            stubs = StubRepository.create(resolver, options.debug, 'utf8'),
            baseServer = createBaseServer(options),
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
                        var mode = stubResponse._mode ? stubResponse._mode : 'text',
                            encoding = mode === 'binary' ? 'base64' : 'utf8';

                        container.response.writeHead(stubResponse.statusCode, stubResponse.headers);
                        container.response.end(stubResponse.body.toString(), encoding);
                        return stubResponse;
                    });
                },
                metadata: baseServer.metadata,
                addStub: stubs.addStub,
                stubs: stubs.stubs
            }),
            server = baseServer.createNodeServer();

        server.on('connection', function (socket) { result.emit('connection', socket); });

        server.on('request', function (request, response) {
            var container = { request: request, response: response };
            result.emit('request', request.socket, container);
        });

        result.close = function (callback) { server.close(callback); };

        result.listen = function (port) {
            var deferred = Q.defer();
            server.listen(port, function () { deferred.resolve(server.address().port); });
            return deferred.promise;
        };

        return result;
    }

    /**
     * Initializes the http/s server.  I'm certainly not in love with the layers of creation
     * (setup -> initialize -> create)
     * @memberOf module:models/http/baseHttpServer#
     * @param {boolean} allowInjection - The --allowInjection command line parameter
     * @param {boolean} recordRequests - The --mock command line parameter
     * @param {boolean} debug - The --debug command line parameter
     * @returns {Object}
     */
    function initialize (allowInjection, recordRequests, debug) {
        var implementation = {
            protocolName: protocolName,
            createServer: createServer,
            Request: HttpRequest
        };

        return {
            name: protocolName,
            create: AbstractServer.implement(implementation, recordRequests, debug, winston).create,
            Validator: {
                create: function () {
                    return DryRunValidator.create({
                        StubRepository: StubRepository,
                        testRequest: HttpRequest.createTestRequest(),
                        testProxyResponse: {
                            statusCode: 200,
                            headers: {},
                            body: ''
                        },
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
