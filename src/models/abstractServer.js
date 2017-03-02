'use strict';

/**
 * Defines the template for the protocols, abstracting logging, error-handling,
 * and proper close behavior for consistency.  While it's useful to not have to
 * duplicate these responsibilities per protocol implementation, I haven't been
 * crazy about this abstraction (it requires a lot of ping-ponging between this
 * module and the actual implementation to understand a protocol) and may tweak it.
 * @module
 */

/**
 * Creates the protocol implementation
 * @param {Object} implementation - The protocol implementation
 * @param {string} implementation.protocolName - The name of the protocol (prefer lower-case letters)
 * @param {Function} implementation.createServer - The function to create the server and listen on a socket
 * @param {Object} implementation.Request - The request type for the protocol
 * @param {boolean} recordRequests - Whether or not we should record requests (the --mock command line flag)
 * @param {boolean} debug -- Whether or not we should record stub matches (the --debug command line flag)
 * @param {Object} baseLogger - The logger
 * @returns {Object}
 */
function implement (implementation, recordRequests, debug, baseLogger) {
    /**
     * Creates the protocol-specific server
     * @memberOf module:models/abstractServer#
     * @param {Object} options - The startup options
     * @returns {Object} - The interface for all protocols
     */
    function create (options) {
        options.recordRequests = recordRequests;
        options.debug = debug;

        function scopeFor (port) {
            var util = require('util'),
                scope = util.format('%s:%s', implementation.protocolName, port);

            if (options.name) {
                scope += ' ' + options.name;
            }
            return scope;
        }

        var Q = require('q'),
            deferred = Q.defer(),
            requests = [],
            numRequests = 0,
            logger = require('../util/scopedLogger').create(baseLogger, scopeFor(options.port)),
            server = implementation.createServer(logger, options),
            connections = {};

        server.on('connection', function (socket) {
            var helpers = require('../util/helpers'),
                name = helpers.socketName(socket);

            connections[name] = socket;
            logger.debug('%s ESTABLISHED', name);

            socket.on('error', function (error) {
                logger.error('%s transmission error X=> %s', name, JSON.stringify(error));
            });

            socket.on('end', function () { logger.debug('%s LAST-ACK', name); });

            socket.on('close', function () {
                logger.debug('%s CLOSED', name);
                delete connections[name];
            });
        });

        server.on('request', function (socket, request, testCallback) {
            var domain = require('domain').create(),
                helpers = require('../util/helpers'),
                clientName = helpers.socketName(socket),
                errorHandler = function (error) {
                    var exceptions = require('../util/errors');
                    logger.error('%s X=> %s', clientName, JSON.stringify(exceptions.details(error)));
                    server.errorHandler(exceptions.details(error), request);
                    if (testCallback) {
                        testCallback();
                    }
                };

            logger.info('%s => %s', clientName, server.formatRequestShort(request));

            domain.on('error', errorHandler);
            domain.run(function () {
                implementation.Request.createFrom(request).then(function (simpleRequest) {
                    logger.debug('%s => %s', clientName, JSON.stringify(server.formatRequest(simpleRequest)));
                    numRequests += 1;
                    if (recordRequests) {
                        var recordedRequest = helpers.clone(simpleRequest);
                        recordedRequest.timestamp = new Date().toJSON();
                        requests.push(recordedRequest);
                    }
                    return server.respond(simpleRequest, request);
                }).done(function (response) {
                    if (response) {
                        logger.debug('%s <= %s', clientName, JSON.stringify(server.formatResponse(response)));
                    }
                    if (testCallback) {
                        testCallback();
                    }
                }, errorHandler);
            });
        });

        server.listen(options.port || 0).done(function (actualPort) {
            var metadata = server.metadata(options);
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
                numberOfRequests: function () { return numRequests; },
                requests: requests,
                addStub: server.addStub,
                stubs: server.stubs,
                metadata: metadata,
                port: actualPort,
                close: function () {
                    var closeDeferred = Q.defer();
                    server.close(function () {
                        logger.info('Ciao for now');
                        closeDeferred.resolve();
                    });
                    Object.keys(connections).forEach(function (socket) {
                        connections[socket].destroy();
                    });
                    return closeDeferred.promise;
                }
            });
        });

        return deferred.promise;
    }

    return {
        create: create
    };
}

module.exports = {
    implement: implement
};
