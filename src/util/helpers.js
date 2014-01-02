'use strict';

function socketName (socket) {
    var result = socket.remoteAddress;
    if (socket.remotePort) {
        result += ':' + socket.remotePort;
    }
    return result;
}

module.exports = {
    socketName: socketName
};
