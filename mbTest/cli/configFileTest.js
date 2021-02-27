'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    port = api.port + 1,
    mb = require('../mb').create(port),
    path = require('path'),
    isWindows = require('os').platform().indexOf('win') === 0,
    BaseHttpClient = require('../baseHttpClient'),
    baseTimeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000),
    timeout = isWindows ? 2 * baseTimeout : baseTimeout,
    smtp = require('../api/smtp/smtpClient'),
    http = BaseHttpClient.create('http'),
    https = BaseHttpClient.create('https');

describe('--configfile', function () {
    this.timeout(timeout);

    afterEach(async function () {
        await mb.stop();
    });

    it('should support complex configuration with --configfile in multiple files', async function () {
        const args = ['--configfile', path.join(__dirname, 'imposters/imposters.ejs')];
        await mb.start(args);

        const first = await http.post('/orders', '', 4545);
        assert.strictEqual(first.statusCode, 201);
        assert.strictEqual(first.headers.location, 'http://localhost:4545/orders/123');

        const second = await http.post('/orders', '', 4545);
        assert.strictEqual(second.statusCode, 201);
        assert.strictEqual(second.headers.location, 'http://localhost:4545/orders/234');

        const third = await http.get('/orders/123', 4545);
        assert.strictEqual(third.body, 'Order 123');

        const fourth = await http.get('/orders/234', 4545);
        assert.strictEqual(fourth.body, 'Order 234');

        const fifth = await https.get('/accounts/123', 5555);
        assert.strictEqual(fifth.statusCode, 401);

        const sixth = await https.responseFor({
            method: 'GET',
            path: '/accounts/123',
            port: 5555,
            headers: { authorization: 'Basic blah===' }
        });
        assert.ok(sixth.body.indexOf('<id>123</id>') > 0);

        const seventh = await https.responseFor({
            method: 'GET',
            path: '/accounts/234',
            port: 5555,
            headers: { authorization: 'Basic blah===' }
        });
        assert.strictEqual(seventh.statusCode, 404);

        const email = await smtp.send({
            from: '"From 1" <from1@mb.org>',
            to: ['"To 1" <to1@mb.org>'],
            subject: 'subject 1',
            text: 'text 1'
        }, 6565);
        assert.strictEqual(email.response, '250 OK: message queued');

        const eighth = await https.get('/users/123', 7575);
        assert.ok(eighth.body.indexOf('<users>') > -1);
        assert.ok(eighth.body.indexOf('<id>123</id>') > 0);
    });

    // This is the response resolver injection example on /docs/api/injection
    it('should evaluate stringify function in templates when loading configuration files', async function () {
        const args = ['--configfile', path.join(__dirname, 'templates/imposters.ejs'), '--allowInjection', '--localOnly'];
        await mb.start(args);

        const first = await http.get('/first', 4546);
        assert.deepEqual(first.body, { count: 1 });

        const second = await http.get('/second', 4546);
        assert.deepEqual(second.body, { count: 2 });

        const third = await http.get('/first', 4546);
        assert.deepEqual(third.body, { count: 1 });

        const fourth = await http.get('/counter', 4546);
        assert.strictEqual(fourth.body, 'There have been 2 proxied calls');
    });

    it('should evaluate nested stringify functions when loading configuration files', async function () {
        const args = ['--configfile', path.join(__dirname, 'nestedStringify/imposters.ejs'), '--allowInjection', '--localOnly'];
        await mb.start(args);

        const response = await http.get('/', 4542);
        assert.deepEqual(response.body, { success: true });
    });

    it('should evaluate stringify functions with injected data when loading configuration files', async function () {
        const args = ['--configfile', path.join(__dirname, 'dataStringify/imposters.ejs'), '--allowInjection', '--localOnly'];
        await mb.start(args);

        const first = await http.get('/', 4542);
        assert.deepStrictEqual(first.body, { success: true, injectedValue: '1111' });

        const second = await http.get('/', 4542);
        assert.deepStrictEqual(second.body, { success: true, injectedValue: '2222' });

        const third = await http.get('/', 4542);
        assert.deepStrictEqual(third.body, { success: true, injectedValue: '3333' });
    });

    it('should not render through ejs when --noParse option provided', async function () {
        const args = ['--configfile', path.join(__dirname, 'noparse.json'), '--noParse'];
        await mb.start(args);

        const response = await http.get('/', 4545);

        assert.strictEqual(response.body, '<% should not render through ejs');
    });

    it('should evaluate gzipped requests (issue #477)', async function () {
        const zlib = require('zlib'),
            args = ['--debug', '--configfile', path.join(__dirname, 'gzip.json')],
            buffer = zlib.gzipSync('{"title": "Harry Potter"}');
        await mb.start(args);

        const response = await http.responseFor({
            method: 'POST',
            path: '/',
            port: 4542,
            headers: { 'Content-Encoding': 'gzip' },
            mode: 'binary',
            body: buffer
        });

        assert.deepEqual(response.body.code, 'SUCCESS');
    });
});
