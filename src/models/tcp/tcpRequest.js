'use strict';

var Q = require('q'),
    helpers = require('../../util/helpers');

function createTestRequest () {
    return {
        requestFrom: '',
        data: 'test'
    };
}

function createFrom (request) {
    return Q({
        requestFrom: helpers.socketName(request.socket),
        data: request.data
    });
}

module.exports = {
    createTestRequest: createTestRequest,
    createFrom: createFrom
};
