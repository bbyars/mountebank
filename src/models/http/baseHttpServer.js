'use strict';

/**
 * The base implementation of http/s servers
 * @module
 */

module.exports = function (createBaseServer) {

    function create (options, logger, responseFn) {
        const Q = require('q'),
            deferred = Q.defer(),
            connections = {},
            defaultResponse = options.defaultResponse || {};

        function postProcess (stubResponse, request) {
            /* eslint complexity: 0 */
            const headersHelper = require('./headersHelper'),
                defaultHeaders = defaultResponse.headers || {},
                response = {
                    statusCode: stubResponse.statusCode || defaultResponse.statusCode || 200,
                    headers: stubResponse.headers || defaultHeaders,
                    body: stubResponse.body || defaultResponse.body || '',
                    _mode: stubResponse._mode || defaultResponse._mode || 'text'
                },
                responseHeaders = headersHelper.getJar(response.headers),
                encoding = response._mode === 'binary' ? 'base64' : 'utf8',
                isObject = require('../../util/helpers').isObject;

            if (isObject(response.body)) {
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

            if (encoding === 'base64') {
                // ensure the base64 has no newlines or other non
                // base64 chars that will cause the body to be garbled.
                response.body = response.body.replace(/[^A-Za-z0-9=+/]+/g, '');
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

        const baseServer = createBaseServer(options),
            server = baseServer.createNodeServer();

        // Allow long wait behaviors
        server.timeout = 0;

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
                let simplifiedRequest;
                require('./httpRequest').createFrom(request).then(simpleRequest => {
                    logger.debug('%s => %s', clientName, JSON.stringify(simpleRequest));
                    simplifiedRequest = simpleRequest;
                    return responseFn(simpleRequest, { rawUrl: request.url });
                }).done(mbResponse => {
                    if (mbResponse.blocked) {
                        request.socket.end();
                        return;
                    }

                    const stubResponse = postProcess(mbResponse, simplifiedRequest),
                        encoding = stubResponse._mode === 'binary' ? 'base64' : 'utf8';

                    response.writeHead(stubResponse.statusCode, stubResponse.headers);
                    response.end(stubResponse.body.toString(), encoding);

                    if (stubResponse) {
                        logger.debug('%s <= %s', clientName, JSON.stringify(stubResponse));
                    }
                }, errorHandler);
            });
        });

        // Bind the socket to a port (the || 0 bit auto-selects a port if one isn't provided)
        server.listen(options.port || 0, options.host, () => {
            deferred.resolve({
                port: server.address().port,
                metadata: baseServer.metadata,
                close: callback => {
                    server.close(callback);
                    Object.keys(connections).forEach(socket => {
                        connections[socket].destroy();
                    });
                },
                proxy: require('./httpProxy').create(logger),
                encoding: 'utf8'
            });
        });

        return deferred.promise;
    }

    return {
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
        },
        create: create,
        validate: undefined
    };
};
