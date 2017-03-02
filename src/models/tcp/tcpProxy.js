'use strict';

/**
 * Represents the tcp proxy implementation
 * @module
 */

/**
 * Creates the proxy
 * @param {Object} logger - The logger
 * @param {string} encoding - utf8 or base64, depending on if the destination expects text or binary
 * @returns {Object}
 */
function create (logger, encoding) {
    function socketName (socket) {
        return socket.host + ':' + socket.port;
    }

    function format (request) {
        return request.data.toString(encoding);
    }

    function connectionInfoFor (proxyDestination) {
        if (typeof proxyDestination === 'string') {
            var url = require('url'),
                parts = url.parse(proxyDestination),
                errors = require('../../util/errors');

            if (parts.protocol !== 'tcp:') {
                throw errors.InvalidProxyError('Unable to proxy to any protocol other than tcp',
                    { source: proxyDestination });
            }
            return { host: parts.hostname, port: parts.port };
        }
        else {
            // old syntax, inconsistent with http proxies: { host: 'localhost', port: 3000 }
            // left for backwards compatibility prior to version 1.4.1
            return proxyDestination;
        }
    }

    function getProxyRequest (proxyDestination, originalRequest) {
        var buffer = new Buffer(originalRequest.data, encoding),
            net = require('net'),
            socket = net.connect(connectionInfoFor(proxyDestination), function () {
                socket.write(buffer, function () { socket.end(); });
            });
        return socket;
    }

    function proxy (socket) {
        var packets = [],
            Q = require('q'),
            deferred = Q.defer(),
            start = new Date();

        socket.on('data', function (data) {
            packets.push(data);
        });
        socket.on('end', function () {
            deferred.resolve({
                data: Buffer.concat(packets).toString(encoding),
                _proxyResponseTime: new Date() - start
            });
        });
        return deferred.promise;
    }

    /**
     * Proxies a tcp request to the destination
     * @param {string} proxyDestination - The URL to proxy to (e.g. tcp://127.0.0.1:3535)
     * @param {Object} originalRequest - The tcp request to forward
     * @returns {Object} - A promise resolving to the response
     */
    function to (proxyDestination, originalRequest) {

        function log (direction, what) {
            logger.debug('Proxy %s %s %s %s %s',
                originalRequest.requestFrom, direction, JSON.stringify(format(what)), direction, socketName(proxyDestination));
        }

        var Q = require('q'),
            deferred = Q.defer(),
            proxiedRequest;

        try {
            proxiedRequest = getProxyRequest(proxyDestination, originalRequest);
            log('=>', originalRequest);

            proxy(proxiedRequest).done(function (response) {
                log('<=', response);
                deferred.resolve(response);
            });

            proxiedRequest.once('error', function (error) {
                var errors = require('../../util/errors');

                if (error.code === 'ENOTFOUND') {
                    deferred.reject(errors.InvalidProxyError('Cannot resolve ' + JSON.stringify(proxyDestination)));
                }
                else if (error.code === 'ECONNREFUSED') {
                    deferred.reject(errors.InvalidProxyError('Unable to connect to ' + JSON.stringify(proxyDestination)));
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

    return {
        to: to
    };
}

module.exports = {
    create: create
};
