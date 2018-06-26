'use strict';

/**
 * Transforms an SMTP request into the simplified API-friendly mountebank request
 * @module
 */

function addressValues (addresses) {
    // mailparser sometimes returns an array, sometimes an object, so we have to normalize
    var util = require('util');
    if (!addresses) {
        addresses = [];
    }
    if (!util.isArray(addresses)) {
        addresses = [addresses];
    }
    return addresses.map(address => address.value[0]);
}

function transform (request, email) {
    return {
        requestFrom: request.remoteAddress,
        envelopeFrom: request.from,
        envelopeTo: request.to,
        from: email.from.value[0],
        to: addressValues(email.to),
        cc: addressValues(email.cc),
        bcc: addressValues(email.bcc),
        subject: email.subject,
        priority: email.priority || 'normal',
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
        deferred = Q.defer();

    const simpleParser = require('mailparser2').simpleParser2;
    simpleParser(request, (err, mail) => {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve(transform(request, mail));
        }
    });

    return deferred.promise;
}

module.exports = {
    createFrom: createFrom
};
