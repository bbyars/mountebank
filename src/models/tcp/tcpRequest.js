'use strict';

var util = require('util'),
    Q = require('q');

function socketName (socket) {
    return util.format('%s:%s', socket.remoteAddress, socket.remotePort);
}

function createTestRequest () {
    return {
        requestFrom: '',
        data: ''
    };
}

function createFrom (request) {
    return Q({
        requestFrom: socketName(request.socket),
        data: request.data
    });
}

module.exports = {
    createTestRequest: createTestRequest,
    createFrom: createFrom
};
