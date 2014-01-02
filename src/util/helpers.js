'use strict';

function socketName (socket) {
    var result = socket.remoteAddress;
    if (socket.remotePort) {
        result += ':' + socket.remotePort;
    }
    return result;
}

function clone (obj) {
    return JSON.parse(JSON.stringify(obj));
}

function merge (defaults, overrides) {
    var result = clone(defaults);
    Object.keys(overrides).forEach(function (key) {
        if (typeof overrides[key] === 'object') {
            result[key] = merge(result[key] || {}, overrides[key]);
        }
        else {
            result[key] = overrides[key];
        }
    });
    return result;
}

module.exports = {
    socketName: socketName,
    clone: clone,
    merge: merge
};
