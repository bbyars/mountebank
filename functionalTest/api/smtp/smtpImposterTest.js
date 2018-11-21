'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    client = require('./smtpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000);

describe('smtp imposter', () => {
    describe('POST /imposters/:id', () => {
        promiseIt('should auto-assign port if port not provided', () => {
            const request = { protocol: 'smtp' };

            return api.post('/imposters', request).then(response => {
                assert.strictEqual(response.statusCode, 201);
                assert.ok(response.body.port > 0);
            }).finally(() => api.del('/imposters'));
        }).timeout(timeout);
    });

    describe('GET /imposters/:id', () => {
        promiseIt('should provide access to all requests', () => {
            const imposterRequest = { protocol: 'smtp', port };

            return api.post('/imposters', imposterRequest).then(() => client.send({
                envelopeFrom: 'envelopeFrom1@mb.org',
                envelopeTo: ['envelopeTo1@mb.org'],
                from: '"From 1" <from1@mb.org>',
                to: ['"To 1" <to1@mb.org>'],
                subject: 'subject 1',
                text: 'text 1'
            }, port)).then(() => client.send({
                envelopeFrom: 'envelopeFrom2@mb.org',
                envelopeTo: ['envelopeTo2@mb.org'],
                from: '"From 2" <from2@mb.org>',
                to: ['"To 2" <to2@mb.org>'],
                cc: ['"CC 2" <cc2@mb.org>'],
                bcc: ['"BCC 2" <bcc2@mb.org>'],
                subject: 'subject 2',
                text: 'text 2'
            }, port)).then(() => api.get(`/imposters/${port}`)).then(response => {
                const requests = response.body.requests;
                requests.forEach(request => {
                    if (request.requestFrom) {
                        request.requestFrom = 'HERE';
                    }
                    if (request.timestamp) {
                        request.timestamp = 'NOW';
                    }
                });
                assert.deepEqual(requests, [
                    {
                        timestamp: 'NOW',
                        requestFrom: 'HERE',
                        envelopeFrom: 'envelopeFrom1@mb.org',
                        envelopeTo: ['envelopeTo1@mb.org'],
                        from: { address: 'from1@mb.org', name: 'From 1' },
                        to: [{ address: 'to1@mb.org', name: 'To 1' }],
                        cc: [],
                        bcc: [],
                        subject: 'subject 1',
                        priority: 'normal',
                        references: [],
                        inReplyTo: [],
                        text: 'text 1',
                        html: '',
                        attachments: []
                    },
                    {
                        timestamp: 'NOW',
                        requestFrom: 'HERE',
                        envelopeFrom: 'envelopeFrom2@mb.org',
                        envelopeTo: ['envelopeTo2@mb.org'],
                        from: { address: 'from2@mb.org', name: 'From 2' },
                        to: [{ address: 'to2@mb.org', name: 'To 2' }],
                        cc: [{ address: 'cc2@mb.org', name: 'CC 2' }],
                        bcc: [{ address: 'bcc2@mb.org', name: 'BCC 2' }],
                        subject: 'subject 2',
                        priority: 'normal',
                        references: [],
                        inReplyTo: [],
                        text: 'text 2',
                        html: '',
                        attachments: []
                    }
                ]);
            }).finally(() => api.del('/imposters'));
        }).timeout(timeout);
    });

    describe('DELETE /imposters/:id should shutdown server at that port', () => {
        promiseIt('should shutdown server at that port', () => {
            const request = { protocol: 'smtp', port };

            return api.post('/imposters', request).then(response => api.del(response.headers.location)).then(response => {
                assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));

                return api.post('/imposters', request);
            }).then(response => {
                assert.strictEqual(response.statusCode, 201, 'Delete did not free up port');
            }).finally(() => api.del(`/imposters/${port}`));
        }).timeout(timeout);
    });
});
