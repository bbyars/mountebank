'use strict';

var net = require('net'),
    Q = require('q');

function send (message, serverPort) {
    var deferred = Q.defer(),
        client = net.connect({ port: serverPort }, function () { client.write(message); });

//    client.setEncoding('utf8');
    client.once('error', deferred.reject);
    client.once('data', deferred.resolve);
    return deferred.promise;
}

module.exports = {
    send: send
};
