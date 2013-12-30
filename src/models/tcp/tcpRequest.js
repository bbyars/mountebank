'use strict';

function createTestRequest () {
    return {
        requestFrom: '',
        data: ''
    };
}

function createFrom (requestFrom, data) {
    return {
        requestFrom: requestFrom,
        data: data
    };
}

module.exports = {
    createTestRequest: createTestRequest,
    createFrom: createFrom
};
