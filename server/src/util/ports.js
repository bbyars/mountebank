'use strict';

var Q = require('q'),
    exec = require('child_process').exec;

function isValidPortNumber (port) {
    return typeof(port) !== 'undefined' &&
        port.toString().indexOf('.') === -1 &&
        port > 0 &&
        port < 65536;
}

function isPortInUse (port) {
    var deferred = Q.defer();
    exec('lsof -i :' + port, function (error) {
        // lsof returns 0 when it finds a bound process
        deferred.resolve(error === null);
    });
    return deferred.promise;
}

module.exports = {
    isValidPortNumber: isValidPortNumber,
    isPortInUse: isPortInUse
};
