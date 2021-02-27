'use strict';

const SMTPConnection = require('nodemailer/lib/smtp-connection');

function addressOf (email) {
    if (email.indexOf('<') < 0) {
        return email;
    }
    return (/<([^>]+)>/).exec(email)[1];
}

function messageText (message) {
    let result = `From: ${message.from}`;
    message.to.forEach(address => { result += `\r\nTo: ${address}`; });
    message.cc.forEach(address => { result += `\r\nCc: ${address}`; });
    message.bcc.forEach(address => { result += `\r\nBcc: ${address}`; });
    result += `\r\nSubject: ${message.subject}`;
    result += `\r\n\r\n${message.text}`;
    return result;
}

function send (message, port, host = '127.0.0.1') {
    if (!port) {
        throw Error('you forgot to pass the port again');
    }

    message.cc = message.cc || [];
    message.bcc = message.bcc || [];

    return new Promise((resolve, reject) => {
        const connection = new SMTPConnection({ port, host });

        connection.on('error', reject);

        connection.connect(connectionError => {
            if (connectionError) {
                reject(connectionError);
            }
            let envelope = {
                from: message.envelopeFrom || addressOf(message.from),
                to: message.envelopeTo || message.to.concat(message.cc).concat(message.bcc).map(addressOf)
            };
            connection.send(envelope, messageText(message), (sendError, info) => {
                if (sendError) {
                    reject(sendError);
                }
                connection.quit();
                resolve(info);
            });
        });
    });
}

module.exports = {
    send: send
};
