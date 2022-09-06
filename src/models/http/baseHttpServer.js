'use strict';

/**
 * The base implementation of http/s servers
 * @module
 */

const net = require('net'),
    headersMap = require('./headersMap.js'),
    errors = require('../../util/errors.js'),
    httpProxy = require('./httpProxy.js'),
    httpRequest = require('./httpRequest.js'),
    helpers = require('../../util/helpers.js');

module.exports = function (createBaseServer) {

    function create (options, logger, responseFn) {
        const connections = {},
            defaultResponse = options.defaultResponse || {};

        function postProcess (stubResponse, request) {
            /* eslint complexity: 0 */
            const defaultHeaders = defaultResponse.headers || {},
                response = {
                    statusCode: stubResponse.statusCode || defaultResponse.statusCode || 200,
                    headers: stubResponse.headers || defaultHeaders,
                    body: stubResponse.body || defaultResponse.body || '',
                    _mode: stubResponse._mode || defaultResponse._mode || 'text'
                },
                responseHeaders = headersMap.of(response.headers),
                encoding = response._mode === 'binary' ? 'base64' : 'utf8',
                isObject = helpers.isObject;

            if (isObject(response.body)) {
                // Support JSON response bodies
                response.body = JSON.stringify(response.body, null, 4);
            }

            if (options.allowCORS) {
                const requestHeaders = headersMap.of(request.headers),
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

            if (!responseHeaders.has('Connection')) {
                responseHeaders.set('Connection', 'close');
            }

            if (responseHeaders.has('Content-Length')) {
                responseHeaders.set('Content-Length', Buffer.byteLength(response.body, encoding));
            }

            return response;
        }

        const baseServer = createBaseServer(options),
            server = baseServer.createNodeServer();

        // Allow long wait behaviors
        server.timeout = 0;

        server.on('connect', (response, client, head) => {
            const host = response.socket.servername;
            const port = response.socket.localPort;
            // may we prefer this method instead?
            const proxyServer = net.createConnection({ host, port }, () => {
                client.on('error', err => {
                    logger.warn('CLIENT TO PROXY ERROR: [%s] %s', err.code, err.message);
                    logger.debug('%s', err.stack);
                });
                proxyServer.on('error', err => {
                    logger.warn('SERVER PROXY ERROR: [%s] %s', err.code, err.message);
                    logger.debug('%s', err.stack);
                });

                logger.info('PROXY TO SERVER SET UP TO %s ON %s', host, port);
                client.write('HTTP/1.1 200 Connection established\r\n\r\n');
                proxyServer.write(head);
                proxyServer.pipe(client);
                client.pipe(proxyServer);
            });
        });

        server.on('connection', socket => {
            const name = helpers.socketName(socket);

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

        server.on('request', async (request, response) => {
            const clientName = helpers.socketName(request.socket);

            logger.info(`${clientName} => ${request.method} ${request.url}`);

            try {
                const simplifiedRequest = await httpRequest.createFrom(request);
                logger.debug('%s => %s', clientName, JSON.stringify(simplifiedRequest));

                const mbResponse = await responseFn(simplifiedRequest, { rawUrl: request.url }),
                    stubResponse = postProcess(mbResponse, simplifiedRequest),
                    encoding = stubResponse._mode === 'binary' ? 'base64' : 'utf8';

                if (mbResponse.blocked) {
                    request.socket.destroy();
                    return;
                }

                if (helpers.simulateFault(request.socket, mbResponse.fault, logger)) {
                    return;
                }

                response.writeHead(stubResponse.statusCode, stubResponse.headers);
                response.end(stubResponse.body.toString(), encoding);

                if (stubResponse) {
                    logger.debug('%s <= %s', clientName, JSON.stringify(stubResponse));
                }
            }
            catch (error) {
                const exceptions = errors;
                logger.error('%s X=> %s', clientName, JSON.stringify(exceptions.details(error)));
                response.writeHead(500, { 'content-type': 'application/json' });
                response.end(JSON.stringify({ errors: [exceptions.details(error)] }), 'utf8');
            }
        });

        return new Promise((resolve, reject) => {
            server.on('error', error => {
                if (error.errno === 'EADDRINUSE') {
                    reject(errors.ResourceConflictError(`Port ${options.port} is already in use`));
                }
                else if (error.errno === 'EACCES') {
                    reject(errors.InsufficientAccessError());
                }
                else {
                    reject(error);
                }
            });

            // Bind the socket to a port (the || 0 bit auto-selects a port if one isn't provided)
            server.listen(options.port || 0, options.host, () => {
                resolve({
                    port: server.address().port,
                    metadata: baseServer.metadata,
                    close: callback => {
                        server.close(callback);
                        Object.keys(connections).forEach(socket => {
                            connections[socket].destroy();
                        });
                    },
                    proxy: httpProxy.create(logger),
                    encoding: 'utf8'
                });
            });
        });
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
