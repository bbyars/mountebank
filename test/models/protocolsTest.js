'use strict';

const assert = require('assert'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    FakeLogger = require('../fakes/fakeLogger'),
    combinators = require('../../src/util/combinators'),
    fs = require('fs'),
    Q = require('q'),
    loader = require('../../src/models/protocols');

describe('protocols', function () {
    describe('#load', function () {
        it('should return only builtins if no customProtocols passed in', function () {
            const builtIns = { proto: { create: mock() } },
                protocols = loader.load(builtIns, {}, combinators.identity);
            assert.deepEqual(Object.keys(protocols), ['proto']);
        });

        describe('#outOfProcessCreate', function () {
            promiseIt('should log error if invalid command passed', function () {
                const customProtocols = { test: { createCommand: 'no-such-command' } },
                    protocols = loader.load({}, customProtocols, combinators.identity),
                    logger = FakeLogger.create();

                return protocols.test.createServer({}, logger).then(() => {
                    assert.fail('should have errored');
                }, error => {
                    delete error.details;
                    logger.error.assertLogged('Invalid implementation for protocol "test": cannot run "no-such-command"');
                    assert.deepEqual(error, {
                        code: 'invalid protocol implementation',
                        message: 'Invalid implementation for protocol "test": cannot run "no-such-command"',
                        source: 'no-such-command'
                    });
                });
            });

            promiseIt('should return even if invalid JSON written on stdout', function () {
                const fn = () => { console.log('TESTING 1 2 3'); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, combinators.identity),
                    logger = FakeLogger.create();

                return protocols.test.createServer({}, logger).then(server => {
                    assert.deepEqual(server.metadata, {});
                }).finally(() => fs.unlinkSync('protocol-test.js'));
            });

            promiseIt('should default to the port in the creationRequest', function () {
                const fn = () => { console.log('{}'); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, combinators.identity),
                    logger = FakeLogger.create();

                return protocols.test.createServer({ port: 3000 }, logger).then(server => {
                    assert.strictEqual(server.port, 3000);
                }).finally(() => fs.unlinkSync('protocol-test.js'));
            });

            promiseIt('should allow changing port by writing it as JSON to stdout', function () {
                const fn = () => { console.log(JSON.stringify({ port: 3000 })); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, combinators.identity),
                    logger = FakeLogger.create();

                return protocols.test.createServer({}, logger).then(server => {
                    assert.strictEqual(server.port, 3000);
                }).finally(() => fs.unlinkSync('protocol-test.js'));
            });

            promiseIt('should allow returning metadata by writing it as JSON to stdout', function () {
                const fn = () => { console.log(JSON.stringify({ mode: 'text' })); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, combinators.identity),
                    logger = FakeLogger.create();

                return protocols.test.createServer({}, logger).then(server => {
                    assert.deepEqual(server.metadata, { mode: 'text' });
                }).finally(() => fs.unlinkSync('protocol-test.js'));
            });

            promiseIt('should pipe stdout to the logger', function () {
                const fn = () => {
                    console.log(JSON.stringify({}));
                    console.log('debug testing 1 2 3');
                    console.log('info testing 2 3 4');
                    console.log('warn testing 3 4 5');
                    console.log('error testing 4 5 6');
                };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, combinators.identity),
                    logger = FakeLogger.create();

                // Sleep to allow the log statements to finish
                return protocols.test.createServer({}, logger).then(() => Q.delay(100)).then(() => {
                    logger.debug.assertLogged('testing 1 2 3');
                    logger.info.assertLogged('testing 2 3 4');
                    logger.warn.assertLogged('testing 3 4 5');
                    logger.error.assertLogged('testing 4 5 6');
                }).finally(() => fs.unlinkSync('protocol-test.js'));
            });

            promiseIt('should pass port, callback url, default response, and creation metadata to process', function () {
                const fn = () => { console.log(JSON.stringify({ args: process.argv.splice(2) })); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = {
                        test: {
                            createCommand: 'node ./protocol-test.js',
                            metadata: ['mode']
                        }
                    },
                    protocols = loader.load({}, customProtocols, () => 'CALLBACK-URL'),
                    logger = FakeLogger.create(),
                    creationRequest = {
                        port: 3000,
                        defaultResponse: { key: 'default' },
                        mode: 'text',
                        ignore: 'true'
                    };

                // Sleep to allow the second echo command to finish
                return protocols.test.createServer(creationRequest, logger).then(server => {
                    assert.deepEqual(server.metadata.args, [
                        '3000',
                        'CALLBACK-URL',
                        JSON.stringify({ key: 'default' }),
                        JSON.stringify({ mode: 'text' })
                    ]);
                }).finally(() => fs.unlinkSync('protocol-test.js'));
            });
        });
    });
});
