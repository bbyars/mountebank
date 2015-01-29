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

    return AbstractProxy.create({
        logger: logger,
        formatRequest: format,
        formatResponse: format,
        formatDestination: socketName,
        getProxyRequest: getProxyRequest,
        proxy: proxy
    });
}

module.exports = {
    create: create
};
