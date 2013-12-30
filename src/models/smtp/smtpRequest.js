'use strict';

var Q = require('q'),
    Parser = require('mailparser').MailParser;

function transform (request, email) {
    /* jshint maxcomplexity: 7 */
    return {
        requestFrom: request.remoteAddress,
        envelopeFrom: request.from,
        envelopeTo: request.to,
        from: email.from[0],
        to: email.to,
        cc: email.cc || [],
        bcc: email.bcc || [],
        subject: email.subject,
        priority: email.priority,
        references: email.references || [],
        inReplyTo: email.inReplyTo || [],
        text: email.text,
        html: email.html || '',
        attachments: email.attachments || []
    };
}

function createFrom (request) {
    var deferred = Q.defer(),
        parser = new Parser();

    request.on('data', function (chunk) { parser.write(chunk); });
    request.once('end', function () { parser.end(); });
    parser.once('end', function (email) { deferred.resolve(transform(request, email)); });
    return deferred.promise;
}

module.exports = {
    createFrom: createFrom
};
