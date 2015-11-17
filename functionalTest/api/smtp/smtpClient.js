'use strict';

var smtp = require('simplesmtp'),
    Q = require('q');

function addressOf (email) {
    if (email.indexOf('<') < 0) {
        return email;
    }
    return (/<([^>]+)>/).exec(email)[1];
}

function send (message, port) {
    var deferred = Q.defer(),
        client = smtp.connect(port);

    if (!port) {
        throw Error('you forgot to pass the port again');
    }

    message.cc = message.cc || [];
    message.bcc = message.bcc || [];
    message.envelopeFrom = message.envelopeFrom || addressOf(message.from);
    message.envelopeTo = message.envelopeTo || message.to.concat(message.cc).concat(message.bcc).map(addressOf);

    client.once('idle', function () {
        client.useEnvelope({ from: message.envelopeFrom, to: message.envelopeTo });
    });

    client.on('message', function () {
        client.write('From: ' + message.from);
        message.to.forEach(function (address) { client.write('\r\nTo: ' + address); });
        message.cc.forEach(function (address) { client.write('\r\nCc: ' + address); });
        message.bcc.forEach(function (address) { client.write('\r\nBcc: ' + address); });
        client.write('\r\nSubject: ' + message.subject);
        client.write('\r\n\r\n' + message.text);
        client.end();
    });

    client.on('ready', function (success, response) {
        if (success) {
            deferred.resolve(response);
        }
        else {
            deferred.reject(response);
        }
    });

    client.on('error', function (error) {
        deferred.reject(error);
    });

    return deferred.promise;
}

module.exports = {
    send: send
};
