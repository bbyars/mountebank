'use strict';

const Q = require('q'),
    smtpClient = require('../../../api/smtp/smtpClient');

function camelCase (key) {
    return key.substring(0, 1).toLowerCase() + key.substring(1);
}

function parseHeader (line) {
    const parts = line.split(':');
    return {
        key: camelCase(parts[0].trim()),
        value: parts.slice(1).join(':').trim()
    };
}

function parse (text) {
    const lines = text.split('\n'),
        message = { to: [], cc: [], bcc: [] };

    for (var i = 0; i < lines.length; i += 1) {
        if (lines[i].trim() === '') {
            break;
        }
        const header = parseHeader(lines[i]);
        if (Array.isArray(message[header.key])) {
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
    const deferred = Q.defer(),
        message = parse(step.requestText);

    smtpClient.send(message, step.port).done(() => {
        deferred.resolve({});
    });

    return deferred.promise;
}

module.exports = { runStep };
