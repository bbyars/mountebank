'use strict';

var net = require('net'),
    Q = require('q');

function send (message, serverPort) {
    var deferred = Q.defer(),
        client = net.connect({ port: serverPort }, function () { client.write(message); });

    client.once('error', deferred.reject);
    client.once('data', deferred.resolve);

    return deferred.promise;
}

function fireAndForget (message, serverPort) {
    var client = net.connect({ port: serverPort }, function () { client.write(message); });
}

module.exports = {
    send: send,
    fireAndForget: fireAndForget
};
