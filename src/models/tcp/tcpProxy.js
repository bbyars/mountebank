'use strict';

var net = require('net'),
    Q = require('q'),
    errors = require('../../errors/errors');

function socketName (socket) {
    return socket.host + ':' + socket.port;
}

function create (logger, encoding) {
    function to (options, originalRequest) {
        var deferred = Q.defer(),
            socket = net.connect(options, function () {
                socket.end(originalRequest.data);
            });

        logger.debug('Proxy %s => %j => %s',
            originalRequest.requestFrom, originalRequest.data.toString(encoding), socketName(options));

        socket.once('data', function (data) {
            logger.debug('Proxy %s <= %j <= %s', originalRequest.requestFrom,
                data.toString(encoding), socketName(options));
            deferred.resolve({ data: data });
        });

        socket.once('error', function (error) {
            if (error.code === 'ENOTFOUND') {
                deferred.reject(errors.InvalidProxyError('Cannot resolve ' + JSON.stringify(options)));
            }
            else if (error.code === 'ECONNREFUSED') {
                deferred.reject(errors.InvalidProxyError('Unable to connect to ' + JSON.stringify(options)));
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
