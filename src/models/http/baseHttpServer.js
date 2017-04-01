'use strict';

/**
 * The base implementation of http/s servers
 * @module
 */

/**
 * Sets up the creation method for the given protocol
 * @param {string} protocolName - http or https
 * @param {Function} createBaseServer - The function to create the http or https server
 * @returns {Object}
 */
function setup (protocolName, createBaseServer) {
    /**
     * Creates the http/s server, opening up the socket
     * @memberOf module:models/http/baseHttpServer#
     * @param {Object} logger - The logger
     * @param {Object} options - Creation options
     * @returns {Object}
     */
    function createServer (logger, options) {

        function postProcess (stubResponse) {
            /* eslint complexity: 0 */
            var headersHelper = require('./headersHelper'),
                defaultResponse = options.defaultResponse || {},
                defaultHeaders = defaultResponse.headers || {},
                response = {
                    statusCode: stubResponse.statusCode || defaultResponse.statusCode || 200,
                    headers: stubResponse.headers || defaultHeaders,
                    body: stubResponse.body || defaultResponse.body || '',
                    _mode: stubResponse._mode || defaultResponse._mode || 'text'
                },
                encoding = response._mode === 'binary' ? 'base64' : 'utf8';

            if (typeof response.body === 'object') {
                // Support JSON response bodies
                response.body = JSON.stringify(response.body, null, 4);
            }

            if (!headersHelper.hasHeader('Connection', response.headers)) {
                // Default to close connections, because a test case
                // may shutdown the stub, which prevents new connections for
                // the port, but that won't prevent the system under test
                // from reusing an existing TCP connection after the stub
                // has shutdown, causing difficult to track down bugs when
                // multiple tests are run.
                response.headers[headersHelper.headerNameFor('Connection', response.headers)] = 'close';
            }

            if (headersHelper.hasHeader('Content-Length', response.headers)) {
                response.headers[headersHelper.headerNameFor('Content-Length', response.headers)] =
                    Buffer.byteLength(response.body, encoding);
            }
            return response;
        }

        var combinators = require('../../util/combinators'),
            proxy = require('./httpProxy').create(logger),
            resolver = require('../responseResolver').create(proxy, postProcess),
            stubs = require('../stubRepository').create(resolver, options.debug, 'utf8'),
            baseServer = createBaseServer(options),
            result = require('../../util/inherit').from(require('events').EventEmitter, {
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
                    var helpers = require('../../util/helpers'),
                        scopedLogger = logger.withScope(helpers.socketName(container.request.socket));

                    return stubs.resolve(httpRequest, scopedLogger, this.state).then(function (stubResponse) {
                        var mode = stubResponse._mode ? stubResponse._mode : 'text',
                            encoding = mode === 'binary' ? 'base64' : 'utf8';

                        container.response.writeHead(stubResponse.statusCode, stubResponse.headers);
                        container.response.end(stubResponse.body.toString(), encoding);
                        return stubResponse;
                    });
                },
                metadata: baseServer.metadata,
                addStub: stubs.addStub,
                state: {},
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
            var deferred = require('q').defer();
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
            Request: require('./httpRequest')
        };

        return {
            name: protocolName,
            create: require('../abstractServer').implement(implementation, recordRequests, debug, require('winston')).create,
            Validator: {
                create: function () {
                    return require('../dryRunValidator').create({
                        StubRepository: require('../stubRepository'),
                        testRequest: require('./httpRequest').createTestRequest(),
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
