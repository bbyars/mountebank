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

    function implement (recordRequests, debug, baseLogger) {

        function create (options) {
            options.recordRequests = options.recordRequests || recordRequests;
            options.debug = debug;

            function scopeFor (port) {
                const util = require('util');
                let scope = util.format('%s:%s', protocolName, port);

                if (options.name) {
                    scope += ` ${options.name}`;
                }
                return scope;
            }

            let numRequests = 0;
            const Q = require('q'),
                deferred = Q.defer(),
                requests = [],
                logger = require('../../util/scopedLogger').create(baseLogger, scopeFor(options.port)),
                connections = {};

            function postProcess (stubResponse, request) {
                /* eslint complexity: 0 */
                const headersHelper = require('./headersHelper'),
                    defaultResponse = options.defaultResponse || {},
                    defaultHeaders = defaultResponse.headers || {},
                    response = {
                        statusCode: stubResponse.statusCode || defaultResponse.statusCode || 200,
                        headers: stubResponse.headers || defaultHeaders,
                        body: stubResponse.body || defaultResponse.body || '',
                        _mode: stubResponse._mode || defaultResponse._mode || 'text'
                    },
                    responseHeaders = headersHelper.getJar(response.headers),
                    encoding = response._mode === 'binary' ? 'base64' : 'utf8';

                if (typeof response.body === 'object') {
                    // Support JSON response bodies
                    response.body = JSON.stringify(response.body, null, 4);
                }

                if (options.allowCORS) {
                    const requestHeaders = headersHelper.getJar(request.headers),
                        isCrossOriginPreflight = request.method === 'OPTIONS' &&
                            requestHeaders.get('Access-Control-Request-Headers') &&
                            requestHeaders.get('Access-Control-Request-Method') &&
                            requestHeaders.get('Origin');

                    if (isCrossOriginPreflight) {
                        responseHeaders.set('Access-Control-Allow-Headers', requestHeaders.get('Access-Control-Request-Headers'));
                        responseHeaders.set('Access-Control-Allow-Methods', requestHeaders.get('Access-Control-Request-Method'));
                        responseHeaders.set('Access-Control-Allow-Origin', requestHeaders.get('Origin'));
                    }
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

            const proxy = require('./httpProxy').create(logger),
                resolver = require('../responseResolver').create(proxy, postProcess),
                stubs = require('../stubRepository').create(resolver, options.debug, 'utf8'),
                baseServer = createBaseServer(options),
                state = {},
                server = baseServer.createNodeServer();

            server.on('connection', socket => {
                const helpers = require('../../util/helpers'),
                    name = helpers.socketName(socket);

                logger.debug('%s ESTABLISHED', name);

                if (socket.on) {
                    connections[name] = socket;

                    socket.on('error', error => {
                        logger.error('%s transmission error X=> %s', name, JSON.stringify(error));
                    });

                    socket.on('end', () => {
                        logger.debug('%s LAST-ACK', name);
                    });

                    socket.on('close', () => {
                        logger.debug('%s CLOSED', name);
                        delete connections[name];
                    });
                }
            });

            server.on('request', (request, response) => {
                const domain = require('domain').create(),
                    helpers = require('../../util/helpers'),
                    clientName = helpers.socketName(request.socket),
                    errorHandler = error => {
                        const exceptions = require('../../util/errors');
                        logger.error('%s X=> %s', clientName, JSON.stringify(exceptions.details(error)));
                        response.writeHead(500, { 'content-type': 'application/json' });
                        response.end(JSON.stringify({ errors: [exceptions.details(error)] }), 'utf8');
                    };

                logger.info(`${clientName} => ${request.method} ${request.url}`);

                domain.on('error', errorHandler);
                domain.run(() => {
                    require('./httpRequest').createFrom({ request }).then(simpleRequest => {
                        logger.debug('%s => %s', clientName, JSON.stringify(simpleRequest));
                        numRequests += 1;
                        if (options.recordRequests) {
                            const recordedRequest = helpers.clone(simpleRequest);
                            recordedRequest.timestamp = new Date().toJSON();
                            requests.push(recordedRequest);
                        }

                        const scopedLogger = logger.withScope(helpers.socketName(request.socket));

                        return stubs.resolve(simpleRequest, scopedLogger, state);
                    }).then(stubResponse => {
                        const mode = stubResponse._mode ? stubResponse._mode : 'text',
                            encoding = mode === 'binary' ? 'base64' : 'utf8';

                        response.writeHead(stubResponse.statusCode, stubResponse.headers);
                        response.end(stubResponse.body.toString(), encoding);

                        if (stubResponse) {
                            logger.debug('%s <= %s', clientName, JSON.stringify(stubResponse));
                        }
                    }, errorHandler);
                });
            });

            server.listen(options.port || 0, () => {
                const metadata = baseServer.metadata(options);
                if (options.name) {
                    metadata.name = options.name;
                }

                if (options.port !== server.address().port) {
                    logger.changeScope(scopeFor(server.address().port));
                }

                logger.info('Open for business...');

                /**
                 * This is the interface for all protocols
                 */
                deferred.resolve({
                    numberOfRequests: () => numRequests,
                    requests,
                    addStub: stubs.addStub,
                    stubs: stubs.stubs,
                    metadata,
                    port: server.address().port,
                    close: () => {
                        const closeDeferred = Q.defer();
                        server.close(() => {
                            logger.info('Ciao for now');
                            closeDeferred.resolve();
                        });
                        Object.keys(connections).forEach(socket => {
                            connections[socket].destroy();
                        });
                        return closeDeferred.promise;
                    },
                    resetProxies: stubs.resetProxies
                });
            });

            return deferred.promise;
        }

        return {
            create
        };
    }

    /**
     * Initializes the http/s server.  I'm certainly not in love with the layers of creation
     * (setup -> initialize -> create)
     * @memberOf module:models/http/baseHttpServer#
     * @param {object} baseLogger - the base logger
     * @param {boolean} recordRequests - The --mock command line parameter
     * @param {boolean} debug - The --debug command line parameter
     * @returns {Object}
     */
    function initialize (baseLogger, recordRequests, debug) {
        return {
            name: protocolName,
            create: implement(recordRequests, debug, baseLogger).create,
            testRequest: {
                requestFrom: '',
                method: 'GET',
                path: '/',
                query: {},
                headers: {},
                form: {},
                body: ''
            },
            testProxyResponse: {
                statusCode: 200,
                headers: {},
                body: ''
            }
        };
    }

    return { initialize };
}

module.exports = { setup };
