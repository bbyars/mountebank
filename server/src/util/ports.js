'use strict';

var Q = require('q'),
    exec = require('child_process').exec;

function isValidPortNumber (port) {
    return typeof(port) !== 'undefined' &&
        port.toString().indexOf('.') === -1 &&
        port > 0 &&
        port < 65536;
}

module.exports = {
    isValidPortNumber: isValidPortNumber
};
