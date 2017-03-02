'use strict';

/**
 * Represents a tcp imposter
 * @module
 */

function createServer (logger, options) {
    function postProcess (response) {
        var defaultResponse = options.defaultResponse || {};
        return {
            data: response.data || defaultResponse.data || ''
        };
    }

    var mode = options.mode ? options.mode : 'text',
        encoding = mode === 'binary' ? 'base64' : 'utf8',
        ensureBuffer = function (data) {
            return Buffer.isBuffer(data) ? data : new Buffer(data, encoding);
        },
        proxy = require('./tcpProxy').create(logger, encoding),
        resolver = require('../responseResolver').create(proxy, postProcess),
        stubs = require('../stubRepository').create(resolver, options.debug, encoding),
        inherit = require('../../util/inherit'),
        combinators = require('../../util/combinators'),
        helpers = require('../../util/helpers'),
        result = inherit.from(require('events').EventEmitter, {
            errorHandler: function (error, container) {
                container.socket.write(JSON.stringify({ errors: [error] }), 'utf8');
            },
            formatRequestShort: function (request) {
                if (request.data.length > 20) {
                    return request.data.toString(encoding).substring(0, 20) + '...';
                }
                else {
                    return request.data.toString(encoding);
                }
            },
            formatRequest: function (tcpRequest) {
                return tcpRequest.data.toString(encoding);
            },
            formatResponse: combinators.identity,
            respond: function (tcpRequest, originalRequest) {
                var clientName = helpers.socketName(originalRequest.socket),
                    scopedLogger = logger.withScope(clientName);

                return stubs.resolve(tcpRequest, scopedLogger, this.state).then(function (stubResponse) {
                    var buffer = ensureBuffer(stubResponse.data);

                    if (buffer.length > 0) {
                        originalRequest.socket.write(buffer);
                    }

                    return buffer.toString(encoding);
                });
            },
            metadata: function () { return { mode: mode }; },
            addStub: stubs.addStub,
            state: {},
            stubs: stubs.stubs
        }),
        server = require('net').createServer();

    function isEndOfRequest (requestData) {
        if (!options.endOfRequestResolver || !options.endOfRequestResolver.inject) {
            return true;
        }

        var injected = '(' + options.endOfRequestResolver.inject + ')(requestData, logger)';

        if (mode === 'text') {
            requestData = requestData.toString('utf8');
        }

        try {
            return eval(injected);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(injected));
            logger.error('    requestData: ' + JSON.stringify(requestData));
            return false;
        }
    }

    server.on('connection', function (socket) {
        var packets = [];
        result.emit('connection', socket);

        socket.on('data', function (data) {
            packets.push(data);

            var requestData = Buffer.concat(packets),
                container = { socket: socket, data: requestData.toString(encoding) };

            if (isEndOfRequest(requestData)) {
                packets = [];
                result.emit('request', socket, container);
            }
        });
    });

    result.close = function (callback) { server.close(callback); };

    result.listen = function (port) {
        var Q = require('q'),
            deferred = Q.defer();

        server.listen(port, function () {
            deferred.resolve(server.address().port);
        });
        return deferred.promise;
    };

    return result;
}

/**
 * Initializes the tcp protocol
 * @param {boolean} allowInjection - The --allowInjection command line parameter
 * @param {boolean} recordRequests - The --mock command line parameter
 * @param {boolean} debug - The --debug command line parameter
 * @returns {Object} - The protocol implementation
 */
function initialize (allowInjection, recordRequests, debug) {
    var implementation = {
            protocolName: 'tcp',
            createServer: createServer,
            Request: require('./tcpRequest')
        },
        logger = require('winston'),
        TcpValidator = require('./tcpValidator'),
        combinators = require('../../util/combinators'),
        AbstractServer = require('../abstractServer');

    return {
        name: implementation.protocolName,
        create: AbstractServer.implement(implementation, recordRequests, debug, logger).create,
        Validator: { create: combinators.curry(TcpValidator.create, allowInjection) }
    };
}

module.exports = {
    initialize: initialize
};
