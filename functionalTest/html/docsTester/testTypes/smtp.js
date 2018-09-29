'use strict';

var Q = require('q'),
    util = require('util'),
    smtpClient = require('../../../api/smtp/smtpClient');

function camelCase (key) {
    return key.substring(0, 1).toLowerCase() + key.substring(1);
}

function parseHeader (line) {
    var parts = line.split(':');
    return {
        key: camelCase(parts[0].trim()),
        value: parts.slice(1).join(':').trim()
    };
}

function parse (text) {
    var lines = text.split('\n'),
        message = { to: [], cc: [], bcc: [] };

    for (var i = 0; i < lines.length; i += 1) {
        if (lines[i].trim() === '') {
            break;
        }
        var header = parseHeader(lines[i]);
        if (util.isArray(message[header.key])) {
            message[header.key].push(header.value);
        }
        else {
            message[header.key] = header.value;
        }
    }
    message.text = lines.slice(i).join('\n').trim();
    return message;
}

function runStep (step) {
    var deferred = Q.defer(),
        message = parse(step.requestText);

    smtpClient.send(message, step.port).done(() => {
        deferred.resolve({});
    });

    return deferred.promise;
}

module.exports = {
    runStep: runStep
};
