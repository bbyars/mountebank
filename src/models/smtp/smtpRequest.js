'use strict';

/**
 * Transforms an SMTP request into the simplified API-friendly mountebank request
 * @module
 */

function transform (request, email) {
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

/**
 * Transforms the raw SMTP request into the mountebank request
 * @param {Object} request - The raw SMTP request
 * @returns {Object}
 */
function createFrom (request) {
    var Q = require('q'),
        Parser = require('mailparser').MailParser,
        deferred = Q.defer(),
        parser = new Parser();

    request.on('data', function (chunk) { parser.write(chunk); });
    request.once('end', function () { parser.end(); });
    parser.once('end', function (email) { deferred.resolve(transform(request, email)); });
    return deferred.promise;
}

module.exports = {
    createFrom: createFrom
};
