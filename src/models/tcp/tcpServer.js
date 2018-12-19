'use strict';

/**
 * Represents a tcp imposter
 * @module
 */

const createServer = (logger, options) => {
    const postProcess = response => {
        const defaultResponse = options.defaultResponse || {};
        return {
            data: response.data || defaultResponse.data || ''
        };
    };

    const mode = options.mode ? options.mode : 'text',
        encoding = mode === 'binary' ? 'base64' : 'utf8',
        ensureBuffer = data => Buffer.isBuffer(data) ? data : new Buffer(data, encoding),
        proxy = require('./tcpProxy').create(logger, encoding),
        resolver = require('../responseResolver').create(proxy, postProcess),
        stubs = require('../stubRepository').create(resolver, options.debug, encoding),
        inherit = require('../../util/inherit'),
        combinators = require('../../util/combinators'),
        helpers = require('../../util/helpers'),
        state = {},
        result = inherit.from(require('events').EventEmitter, {
            errorHandler: (error, container) => {
                container.socket.write(JSON.stringify({ errors: [error] }), 'utf8');
            },
            formatRequestShort: request => {
                if (request.data.length > 20) {
                    return `${request.data.toString(encoding).substring(0, 20)}...`;
                }
                else {
                    return request.data.toString(encoding);
                }
            },
            formatRequest: tcpRequest => tcpRequest.data.toString(encoding),
            formatResponse: combinators.identity,
            respond: (tcpRequest, originalRequest) => {
                const clientName = helpers.socketName(originalRequest.socket),
                    scopedLogger = logger.withScope(clientName);

                return stubs.resolve(tcpRequest, scopedLogger, state).then(stubResponse => {
                    const buffer = ensureBuffer(stubResponse.data);

                    if (buffer.length > 0) {
                        originalRequest.socket.write(buffer);
                    }

                    return buffer.toString(encoding);
                });
            },
            metadata: () => ({ mode }),
            addStub: stubs.addStub,
            state: state,
            stubs: stubs.stubs,
            resetProxies: stubs.resetProxies
        }),
        server = require('net').createServer();

    const isEndOfRequest = requestData => {
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
    };

    server.on('connection', socket => {
        let packets = [];
        result.emit('connection', socket);

        socket.on('data', data => {
            packets.push(data);

            const requestData = Buffer.concat(packets),
                container = { socket: socket, data: requestData.toString(encoding) };

            if (isEndOfRequest(requestData)) {
                packets = [];
                result.emit('request', socket, container);
            }
        });
    });

    result.close = callback => { server.close(callback); };

    result.listen = port => {
        const Q = require('q'),
            deferred = Q.defer();

        server.listen(port, () => {
            deferred.resolve(server.address().port);
        });
        return deferred.promise;
    };

    return result;
};

/**
 * Initializes the tcp protocol
 * @param {object} logger - the base logger
 * @param {boolean} allowInjection - The --allowInjection command line parameter
 * @param {boolean} recordRequests - The --mock command line parameter
 * @param {boolean} debug - The --debug command line parameter
 * @returns {Object} - The protocol implementation
 */
const initialize = (logger, allowInjection, recordRequests, debug) => {
    const implementation = {
            protocolName: 'tcp',
            createServer: createServer,
            Request: require('./tcpRequest')
        },
        TcpValidator = require('./tcpValidator'),
        combinators = require('../../util/combinators'),
        AbstractServer = require('../abstractServer');

    return {
        name: implementation.protocolName,
        create: AbstractServer.implement(implementation, recordRequests, debug, logger).create,
        Validator: { create: combinators.curry(TcpValidator.create, allowInjection) }
    };
};

module.exports = { initialize };
