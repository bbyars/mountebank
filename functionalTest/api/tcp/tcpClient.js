'use strict';

var net = require('net'),
    Q = require('q');

function send (message, serverPort, timeout) {
    var deferred = Q.defer(),
        client = net.connect({ port: serverPort }, function () { client.write(message); });

    if (!serverPort) {
        throw Error('you forgot to pass the port again');
    }

    client.once('error', deferred.reject);
    client.once('data', deferred.resolve);

    if (timeout) {
        setTimeout(function () { deferred.resolve(''); }, timeout);
    }

    return deferred.promise;
}

function fireAndForget (message, serverPort) {
    var deferred = Q.defer(),
        client = net.connect({ port: serverPort }, function () { client.write(message); });

    // Attempt to avoid race conditions where the subsequent test code
    // gets ahead of the server's ability to record the request
    setTimeout(function () {
        deferred.resolve();
    }, 150);
}

module.exports = {
    send: send,
    fireAndForget: fireAndForget
};
