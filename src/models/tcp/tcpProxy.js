'use strict';

/**
 * Represents the tcp proxy implementation
 * @module
 */

/**
 * Creates the proxy
 * @param {Object} logger - The logger
 * @param {string} encoding - utf8 or base64, depending on if the destination expects text or binary
 * @param {Function} isEndOfRequest - the function defining a logical request
 * @returns {Object}
 */
function create (logger, encoding, isEndOfRequest) {

    if (typeof isEndOfRequest === 'undefined') {
        isEndOfRequest = () => true; // defaults to a packet boundary
    }

    function socketName (socket) {
        return `${socket.host}:${socket.port}`;
    }

    function format (request) {
        return request.data.toString(encoding);
    }

    function connectionInfoFor (proxyDestination) {
        const url = require('url'),
            parts = url.parse(proxyDestination),
            errors = require('../../util/errors');

        if (parts.protocol !== 'tcp:') {
            throw errors.InvalidProxyError('Unable to proxy to any protocol other than tcp',
                { source: proxyDestination });
        }
        return { host: parts.hostname, port: parts.port };
    }

    /**
     * Proxies a tcp request to the destination
     * @param {string} proxyDestination - The URL to proxy to (e.g. tcp://127.0.0.1:3535)
     * @param {Object} originalRequest - The tcp request to forward
     * @param {Object} options - Proxy options
     * @param {Boolean} options.keepalive - Whether to keep the connection alive or not
     * @returns {Object} - A promise resolving to the response
     */
    function to (proxyDestination, originalRequest, options = {}) {
        const Q = require('q'),
            deferred = Q.defer();

        try {
            const proxyName = socketName(connectionInfoFor(proxyDestination)),
                log = (direction, what) => {
                    logger.debug('Proxy %s %s %s %s %s',
                        originalRequest.requestFrom, direction, JSON.stringify(format(what)), direction, proxyName);
                },
                buffer = Buffer.from(originalRequest.data, encoding),
                net = require('net'),
                socket = net.connect(connectionInfoFor(proxyDestination), () => {
                    socket.write(buffer);
                }),
                packets = [];

            log('=>', originalRequest);

            socket.on('end', () => {
                logger.debug('%s LAST-ACK', proxyName);
            });

            socket.on('close', () => {
                logger.debug('%s CLOSED', proxyName);
            });

            socket.on('data', data => {
                packets.push(data);
                const requestBuffer = Buffer.concat(packets);
                if (isEndOfRequest(requestBuffer)) {
                    if (!options.keepalive) {
                        socket.end();
                    }
                    const response = { data: requestBuffer.toString(encoding) };
                    log('<=', response);
                    deferred.resolve(response);
                }
            });

            socket.once('error', error => {
                const errors = require('../../util/errors');

                logger.error(`Proxy ${proxyName} transmission error X=> ${JSON.stringify(error)}`);

                if (error.code === 'ENOTFOUND') {
                    deferred.reject(errors.InvalidProxyError(`Cannot resolve ${JSON.stringify(proxyDestination)}`));
                }
                else if (error.code === 'ECONNREFUSED') {
                    deferred.reject(errors.InvalidProxyError(`Unable to connect to ${JSON.stringify(proxyDestination)}`));
                }
                else {
                    deferred.reject(error);
                }
            });
        }
        catch (e) {
            deferred.reject(e);
        }

        return deferred.promise;
    }

    return { to };
}

module.exports = { create };
