'use strict';

/**
 * Transforms an SMTP request into the simplified API-friendly mountebank request
 * @module
 */

function addressValues (addresses) {
    // mailparser sometimes returns an array, sometimes an object, so we have to normalize
    const util = require('util');
    if (!addresses) {
        addresses = [];
    }
    if (!util.isArray(addresses)) {
        addresses = [addresses];
    }
    return addresses.map(address => address.value[0]);
}

function transform (session, email) {
    return {
        requestFrom: session.remoteAddress,
        ip: session.remoteAddress,
        envelopeFrom: session.envelope.mailFrom.address,
        envelopeTo: session.envelope.rcptTo.map(value => value.address),
        from: email.from.value[0],
        to: addressValues(email.to),
        cc: addressValues(email.cc),
        bcc: addressValues(email.bcc),
        subject: email.subject,
        priority: email.priority || 'normal',
        references: email.references || [],
        inReplyTo: email.inReplyTo || [],
        text: (email.text || '').trim(),
        html: (email.html || '').trim(),
        attachments: email.attachments || []
    };
}

/**
 * Transforms the raw SMTP request into the mountebank request
 * @param {Object} request - The raw SMTP request
 * @returns {Object}
 */
function createFrom (request) {
    const Q = require('q'),
        deferred = Q.defer();

    const simpleParser = require('mailparser').simpleParser;
    simpleParser(request.source, (err, mail) => {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve(transform(request.session, mail));
        }
    });

    return deferred.promise;
}

module.exports = { createFrom };
