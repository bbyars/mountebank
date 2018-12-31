'use strict';

/**
 * Represents a tcp imposter
 * @module
 */

function implement (recordRequests, debug, baseLogger) {

    function create (options) {
        options.recordRequests = options.recordRequests || recordRequests;
        options.debug = debug;

        function scopeFor (port) {
            const util = require('util');
            let scope = util.format('tcp:%s', port);

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

        function postProcess (response) {
            const defaultResponse = options.defaultResponse || {};
            return {
                data: response.data || defaultResponse.data || ''
            };
        }

        const mode = options.mode ? options.mode : 'text',
            encoding = mode === 'binary' ? 'base64' : 'utf8',
            ensureBuffer = function (data) { return Buffer.isBuffer(data) ? data : new Buffer(data, encoding); },
            proxy = require('./tcpProxy').create(logger, encoding),
            resolver = require('../responseResolver').create(proxy, postProcess),
            stubs = require('../stubRepository').create(resolver, options.debug, encoding),
            helpers = require('../../util/helpers'),
            state = {},
            server = require('net').createServer();

        function isEndOfRequest (requestData) {
            if (!options.endOfRequestResolver || !options.endOfRequestResolver.inject) {
                return true;
            }

            const injected = `(${options.endOfRequestResolver.inject})(requestData, logger)`;

            if (mode === 'text') {
                requestData = requestData.toString('utf8');
            }

            try {
                return eval(injected);
            }
            catch (error) {
                logger.error(`injection X=> ${error}`);
                logger.error(`    full source: ${JSON.stringify(injected)}`);
                logger.error(`    requestData: ${JSON.stringify(requestData)}`);
                return false;
            }
        }

        server.on('connection', socket => {
            let packets = [];
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

            socket.on('data', data => {
                packets.push(data);

                const requestData = Buffer.concat(packets),
                    container = { socket: socket, data: requestData.toString(encoding) };

                if (isEndOfRequest(requestData)) {
                    packets = [];

                    const domain = require('domain').create(),
                        clientName = helpers.socketName(socket),
                        errorHandler = error => {
                            const exceptions = require('../../util/errors');
                            logger.error('%s X=> %s', clientName, JSON.stringify(exceptions.details(error)));
                            container.socket.write(JSON.stringify({ errors: [error] }), 'utf8');
                        };

                    let requestData2 = container.data;
                    if (requestData2.length > 20) {
                        requestData2 = requestData2.substring(0, 20) + '...';
                    }
                    logger.info('%s => %s', clientName, requestData2);

                    domain.on('error', errorHandler);
                    domain.run(() => {
                        require('./tcpRequest').createFrom(container).then(simpleRequest => {
                            logger.debug('%s => %s', clientName, JSON.stringify(simpleRequest.data.toString(encoding)));
                            numRequests += 1;
                            if (options.recordRequests) {
                                const recordedRequest = helpers.clone(simpleRequest);
                                recordedRequest.timestamp = new Date().toJSON();
                                requests.push(recordedRequest);
                            }

                            const scopedLogger = logger.withScope(clientName);

                            return stubs.resolve(simpleRequest, scopedLogger, state).then(stubResponse => {
                                const buffer = ensureBuffer(stubResponse.data);

                                if (buffer.length > 0) {
                                    container.socket.write(buffer);
                                }

                                return buffer.toString(encoding);
                            });
                        }).done(response => {
                            if (response) {
                                logger.debug('%s <= %s', clientName, JSON.stringify(response));
                            }
                        }, errorHandler);
                    });
                }
            });
        });

        server.listen(options.port || 0, () => {
            const actualPort = server.address().port;
            const metadata = { mode };
            if (options.name) {
                metadata.name = options.name;
            }

            if (options.port !== actualPort) {
                logger.changeScope(scopeFor(actualPort));
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
                port: actualPort,
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
 * Initializes the tcp protocol
 * @param {object} logger - the base logger
 * @param {boolean} recordRequests - The --mock command line parameter
 * @param {boolean} debug - The --debug command line parameter
 * @returns {Object} - The protocol implementation
 */
function initialize (logger, recordRequests, debug) {
    return {
        name: 'tcp',
        create: implement(recordRequests, debug, logger).create,
        testRequest: { data: 'test' },
        testProxyResponse: { data: '' },
        validate: require('./tcpValidator')
    };
}

module.exports = { initialize };
