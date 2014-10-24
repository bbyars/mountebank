'use strict';

var net = require('net'),
    Q = require('q'),
    AbstractProxy = require('../abstractProxy');

function create (tcpProxyWait, logger, encoding) {

    function socketName (socket) {
        return socket.host + ':' + socket.port;
    }

    function format (request) {
        return request.data.toString(encoding);
    }

    function setupProxy (proxyDestination, originalRequest) {
        var socket = net.connect(proxyDestination, function () {
            socket.write(new Buffer(originalRequest.data, encoding));
            setTimeout(function () { socket.end(); }, tcpProxyWait);
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
