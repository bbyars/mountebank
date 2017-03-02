'use strict';

/**
 * Transforms an SMTP request into the simplified API-friendly mountebank request
 * @module
 */

function forceArray (obj) {
    var util = require('util');

    if (!util.isArray(obj)) {
        return [obj];
    }
    else {
        return obj;
    }
}

function convertToNameAndAddress (field) {
    var util = require('util');

    if (util.isArray(field)) {
        return field.map(convertToNameAndAddress);
    }
    else {
        return field.value[0];
    }
}

function transform (request, email) {
    /* eslint complexity: [2, 8] */
    return {
        requestFrom: request.remoteAddress,
        envelopeFrom: request.from,
        envelopeTo: request.to,
        from: email.from.value[0],
        to: forceArray(convertToNameAndAddress(email.to)),
        cc: forceArray(convertToNameAndAddress(email.cc || [])),
        bcc: forceArray(convertToNameAndAddress(email.bcc || [])),
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
        deferred = Q.defer(),
        text = '';

    request.on('data', function (chunk) { text += chunk; });
    request.once('end', function () {
        var parse = require('mailparser').simpleParser;

        parse(text, function (error, mail) {
            if (error) {
                deferred.reject(error);
            }
            deferred.resolve(transform(request, mail));
        });
    });
    return deferred.promise;
}

module.exports = {
    createFrom: createFrom
};
