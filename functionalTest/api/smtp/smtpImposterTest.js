'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    client = require('./smtpClient'),
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000);

describe('smtp imposter', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await api.del('/imposters');
    });

    describe('POST /imposters/:id', function () {
        it('should auto-assign port if port not provided', async function () {
            const request = { protocol: 'smtp' };

            const response = await api.createImposter(request);

            assert.ok(response.body.port > 0);
        });
    });

    describe('GET /imposters/:id', function () {
        it('should provide access to all requests', async function () {
            const imposterRequest = { protocol: 'smtp', port };
            await api.createImposter(imposterRequest);

            await client.send({
                envelopeFrom: 'envelopeFrom1@mb.org',
                envelopeTo: ['envelopeTo1@mb.org'],
                from: '"From 1" <from1@mb.org>',
                to: ['"To 1" <to1@mb.org>'],
                subject: 'subject 1',
                text: 'text 1'
            }, port);
            await client.send({
                envelopeFrom: 'envelopeFrom2@mb.org',
                envelopeTo: ['envelopeTo2@mb.org'],
                from: '"From 2" <from2@mb.org>',
                to: ['"To 2" <to2@mb.org>'],
                cc: ['"CC 2" <cc2@mb.org>'],
                bcc: ['"BCC 2" <bcc2@mb.org>'],
                subject: 'subject 2',
                text: 'text 2'
            }, port);
            const response = await api.get(`/imposters/${port}`);

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
                    ip: '127.0.0.1',
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
                    ip: '127.0.0.1',
                    text: 'text 2',
                    html: '',
                    attachments: []
                }
            ]);
        });
    });

    describe('DELETE /imposters/:id should shutdown server at that port', function () {
        it('should shutdown server at that port', async function () {
            const request = { protocol: 'smtp', port },
                creationResponse = await api.createImposter(request);

            const deletionResponse = await api.del(creationResponse.headers.location);
            assert.strictEqual(deletionResponse.statusCode, 200, JSON.stringify(deletionResponse.body));

            const secondCreationResponse = await api.createImposter(request);
            assert.strictEqual(secondCreationResponse.statusCode, 201, 'Delete did not free up port');
        });
    });
});
