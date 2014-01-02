'use strict';

var assert = require('assert'),
    events = require('events'),
    SmtpRequest = require('../../../src/models/smtp/smtpRequest'),
    promiseIt = require('../../testHelpers').promiseIt,
    inherit = require('../../../src/util/inherit');

describe('smtpRequest', function () {
    describe('#createFrom', function () {
        promiseIt('should parse SMTP data', function () {
            var request = inherit.from(events.EventEmitter, {
                remoteAddress: 'RemoteAddress',
                from: 'EnvelopeFrom',
                to: 'EnvelopeTo'
            });

            var promise = SmtpRequest.createFrom(request).then(function (smtpRequest) {
                assert.deepEqual(smtpRequest, {
                    requestFrom: 'RemoteAddress',
                    envelopeFrom: 'EnvelopeFrom',
                    envelopeTo: 'EnvelopeTo',
                    from: { address: 'from@mb.org', name: 'From' },
                    to: [{ address: 'to1@mb.org', name: 'To1' }, { address: 'to2@mb.org', name: 'To2' }],
                    cc: [{ address: 'cc1@mb.org', name: 'CC1' }, { address: 'cc2@mb.org', name: 'CC2' }],
                    bcc: [{ address: 'bcc1@mb.org', name: 'BCC1' }, { address: 'bcc2@mb.org', name: 'BCC2' }],
                    subject: 'Subject',
                    priority: 'normal',
                    references: [],
                    inReplyTo: [],
                    text: 'Body',
                    html: '',
                    attachments: []
                });
            });

            request.emit('data', 'From: From <from@mb.org>\r\n');
            request.emit('data', 'To: To1 <to1@mb.org>\r\n');
            request.emit('data', 'To: To2 <to2@mb.org>\r\n');
            request.emit('data', 'CC: CC1 <cc1@mb.org>\r\n');
            request.emit('data', 'CC: CC2 <cc2@mb.org>\r\n');
            request.emit('data', 'BCC: BCC1 <bcc1@mb.org>\r\n');
            request.emit('data', 'BCC: BCC2 <bcc2@mb.org>\r\n');
            request.emit('data', 'Subject: Subject\r\n');
            request.emit('data', '\r\nBody');
            request.emit('end');

            return promise;
        });
    });
});
