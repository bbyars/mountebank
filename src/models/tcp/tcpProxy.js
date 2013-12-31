'use strict';

var net = require('net'),
    Q = require('q'),
    AbstractProxy = require('../abstractProxy');

function create (logger, encoding) {

    function socketName (socket) {
        return socket.host + ':' + socket.port;
    }

    function format (request) {
        return request.data.toString(encoding);
    }

    function setupProxy (options, originalRequest) {
        var socket = net.connect(options, function () {
            socket.end(originalRequest.data);
        });
        return socket;
    }

    function proxy (socket) {
        var deferred = Q.defer();

        socket.once('data', function (data) {
            deferred.resolve({ data: data });
        });
        return deferred.promise;
    }

    return AbstractProxy.implement(logger, {
        formatRequest: format,
        formatResponse: format,
        formatDestination: socketName,
        setupProxy: setupProxy,
        proxy: proxy
    });
}

module.exports = {
    create: create
};
