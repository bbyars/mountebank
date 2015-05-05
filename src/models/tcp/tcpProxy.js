'use strict';

var net = require('net'),
    Q = require('q'),
    errors = require('../../util/errors');

function create (logger, encoding) {

    function socketName (socket) {
        return socket.host + ':' + socket.port;
    }

    function format (request) {
        return request.data.toString(encoding);
    }

    function getProxyRequest (proxyDestination, originalRequest) {
        var buffer = new Buffer(originalRequest.data, encoding),
            socket = net.connect(proxyDestination, function () {
                socket.write(buffer, function () { socket.end(); });
            });
        return socket;
    }

    function proxy (socket) {
        var packets = [];
        var deferred = Q.defer();
        socket.on('data', function (data) {
            packets.push(data);
        });
        socket.on('end', function () {
            deferred.resolve({ data: Buffer.concat(packets).toString(encoding) });
        });
        return deferred.promise;
    }

    function to (proxyDestination, originalRequest) {

        function log (direction, what) {
            logger.debug('Proxy %s %s %s %s %s',
                originalRequest.requestFrom, direction, JSON.stringify(format(what)), direction, socketName(proxyDestination));
        }

        var deferred = Q.defer(),
            proxiedRequest = getProxyRequest(proxyDestination, originalRequest);

        log('=>', originalRequest);

        proxy(proxiedRequest).done(function (response) {
            log('<=', response);
            deferred.resolve(response);
        });

        proxiedRequest.once('error', function (error) {
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

        return deferred.promise;
    }

    return {
        to: to
    };
}

module.exports = {
    create: create
};
