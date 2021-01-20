'use strict';

const net = require('net');

function send (message, serverPort, timeout, serverHost) {
    const options = { port: serverPort };

    if (serverHost) {
        options.host = serverHost;
    }

    return new Promise((resolve, reject) => {
        const socket = net.createConnection(options, () => { socket.write(message); });

        if (!serverPort) {
            throw Error('you forgot to pass the port again');
        }

        socket.once('error', reject);
        socket.once('data', resolve);

        if (timeout) {
            setTimeout(() => { resolve(''); }, timeout);
        }
    });
}

function fireAndForget (message, serverPort) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ port: serverPort }, () => { socket.write(message); });

        // Attempt to avoid race conditions where the subsequent test code
        // gets ahead of the server's ability to record the request
        setTimeout(() => { resolve(''); }, 250);
        socket.on('error', reject);
    });
}

module.exports = { send, fireAndForget };
