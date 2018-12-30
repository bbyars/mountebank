'use strict';

/**
 * Represents an smtp imposter
 * @module
 */

function implement (recordRequests, debug, baseLogger) {

    function create (options) {
        options.recordRequests = options.recordRequests || recordRequests;
        options.debug = debug;

        function scopeFor (port) {
            const util = require('util');
            let scope = util.format('%s:%s', 'smtp', port);

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

        function createSMTPServer () {
            const SMTPServer = require('smtp-server').SMTPServer;
            return new SMTPServer({
                disableReverseLookup: true,
                authOptional: true,
                onConnect (socket, callback) {
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
                    return callback();
                },
                onData (stream, socket, callback) {
                    const request = { session: socket, source: stream, callback: callback };
                    const domain = require('domain').create(),
                        helpers = require('../../util/helpers'),
                        clientName = helpers.socketName(socket),
                        errorHandler = error => {
                            const exceptions = require('../../util/errors');
                            logger.error('%s X=> %s', clientName, JSON.stringify(exceptions.details(error)));
                        };

                    logger.info(`${clientName} => Envelope from: ${request.from} to: ${JSON.stringify(request.to)}`);

                    domain.on('error', errorHandler);
                    domain.run(() => {
                        require('./smtpRequest').createFrom(request).then(simpleRequest => {
                            logger.debug('%s => %s', clientName, JSON.stringify(simpleRequest));
                            numRequests += 1;
                            if (options.recordRequests) {
                                const recordedRequest = helpers.clone(simpleRequest);
                                recordedRequest.timestamp = new Date().toJSON();
                                requests.push(recordedRequest);
                            }
                            return Q(request.callback());
                        }).done(response => {
                            if (response) {
                                logger.debug('%s <= %s', clientName, JSON.stringify(response));
                            }
                        }, errorHandler);
                    });

                }
            });
        }

        const server = createSMTPServer();

        server.listen(options.port || 0, () => {
            const actualPort = server.server.address().port;
            const metadata = {};
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
                addStub: () => {},
                stubs: () => [],
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
                resetProxies: server.resetProxies
            });
        });

        return deferred.promise;
    }

    return {
        create
    };
}

/**
 * Initializes the smtp protocol
 * @param {object} logger - the base logger
 * @param {boolean} recordRequests - The --mock command line parameter
 * @param {boolean} debug - The --debug command line parameter
 * @returns {Object}
 */
function initialize (logger, recordRequests, debug) {
    return {
        name: 'smtp',
        create: implement(recordRequests, debug, logger).create,
        testRequest: {
            from: 'test@test.com',
            to: ['test@test.com'],
            subject: 'Test',
            text: 'Test'
        }
    };
}

module.exports = { initialize };
