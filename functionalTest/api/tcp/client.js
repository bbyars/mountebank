'use strict';

var net = require('net'),
    Q = require('q');

Q.longStackSupport = true;

function send (message, serverPort, timeout) {
    var deferred = Q.defer(),
        client = net.connect({ port: serverPort }, function () { client.write(message); });

    client.once('error', deferred.reject);
    client.once('data', deferred.resolve);

    if (timeout) {
        setTimeout(function () { deferred.resolve(''); }, timeout);
    }

    return deferred.promise;
}

function fireAndForget (message, serverPort) {
    var client = net.connect({ port: serverPort }, function () { client.write(message); });
}

module.exports = {
    send: send,
    fireAndForget: fireAndForget
};
