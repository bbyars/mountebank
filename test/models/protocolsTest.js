'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    FakeLogger = require('../fakes/fakeLogger'),
    fs = require('fs'),
    loader = require('../../src/models/protocols'),
    ImpostersRepository = require('../../src/models/inMemoryImpostersRepository');

describe('protocols', function () {
    describe('#load', function () {
        let config, logger, repository;
        const allow = () => true;

        beforeEach(function () {
            config = { loglevel: 'info', callbackURLTemplate: 'url' };
            logger = FakeLogger.create();
            repository = ImpostersRepository.create();
        });

        afterEach(function () {
            if (fs.existsSync('protocol-test.js')) {
                fs.unlinkSync('protocol-test.js');
            }
        });

        it('should return only builtins if no customProtocols passed in', function () {
            const builtIns = { proto: { create: mock() } },
                protocols = loader.load(builtIns, {}, config, allow, logger, repository);

            assert.deepEqual(Object.keys(protocols), ['proto']);
        });

        describe('#outOfProcessCreate', function () {
            it('should error if invalid command passed', async function () {
                const customProtocols = { test: { createCommand: 'no-such-command' } },
                    protocols = loader.load({}, customProtocols, config, allow, logger, repository);

                try {
                    await protocols.test.createServer({}, logger);
                    assert.fail('should have errored');
                }
                catch (error) {
                    delete error.details;
                    assert.deepEqual(error, {
                        code: 'cannot start server',
                        message: 'Invalid configuration for protocol "test": cannot run "no-such-command"',
                        source: 'no-such-command'
                    });
                }
            });

            it('should return even if invalid JSON written on stdout', async function () {
                const fn = () => { console.log('TESTING 1 2 3'); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, config, allow, logger, repository),
                    server = await protocols.test.createServer({}, logger);

                assert.deepEqual(server.metadata, {});
            });

            it('should default to the port in the creationRequest', async function () {
                const fn = () => { console.log('{}'); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, config, allow, logger, repository),
                    server = await protocols.test.createServer({ port: 3000 }, logger);

                assert.strictEqual(server.port, 3000);
            });

            it('should allow changing port by writing it as JSON to stdout', async function () {
                const fn = () => { console.log(JSON.stringify({ port: 3000 })); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, config, allow, logger, repository),
                    server = await protocols.test.createServer({}, logger);

                assert.strictEqual(server.port, 3000);
            });

            it('should allow returning metadata by writing it as JSON to stdout', async function () {
                const fn = () => { console.log(JSON.stringify({ mode: 'text' })); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, config, allow, logger, repository),
                    server = await protocols.test.createServer({}, logger);

                assert.deepEqual(server.metadata, { mode: 'text' });
            });

            async function delay (duration) {
                return new Promise(resolve => {
                    setTimeout(resolve, duration);
                });
            }

            it('should pipe stdout to the logger', async function () {
                const fn = () => {
                    console.log(JSON.stringify({}));
                    console.log('debug testing 1 2 3');
                    console.log('info testing 2 3 4');
                    console.log('warn testing 3 4 5');
                    console.log('error testing 4 5 6');
                };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, config, allow, logger, repository);

                await protocols.test.createServer({}, logger);

                // Sleep to allow the log statements to finish
                await delay(100);

                logger.debug.assertLogged('testing 1 2 3');
                logger.info.assertLogged('testing 2 3 4');
                logger.warn.assertLogged('testing 3 4 5');
                logger.error.assertLogged('testing 4 5 6');
            });

            it('should pass port and callback url to process', async function () {
                const fn = () => { console.log(JSON.stringify({ args: process.argv.splice(2) })); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                config.callbackURLTemplate = 'CALLBACK-URL';
                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, config, allow, logger, repository),
                    creationRequest = { port: 3000 },
                    server = await protocols.test.createServer(creationRequest, logger);

                assert.deepEqual(server.metadata.args, [
                    JSON.stringify({
                        port: 3000,
                        callbackURLTemplate: 'CALLBACK-URL',
                        loglevel: 'info'
                    })
                ]);
            });

            it('should pass custom defaultResponse to process', async function () {
                const fn = () => { console.log(JSON.stringify({ args: process.argv.splice(2) })); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                config.callbackURLTemplate = 'CALLBACK-URL';
                const customProtocols = { test: { createCommand: 'node ./protocol-test.js' } },
                    protocols = loader.load({}, customProtocols, config, allow, logger, repository),
                    creationRequest = { port: 3000, defaultResponse: { key: 'default' } },
                    server = await protocols.test.createServer(creationRequest, logger);

                assert.deepEqual(server.metadata.args, [
                    JSON.stringify({
                        port: 3000,
                        callbackURLTemplate: 'CALLBACK-URL',
                        loglevel: 'info',
                        defaultResponse: { key: 'default' }
                    })
                ]);
            });

            it('should pass custom customProtocolFields to process', async function () {
                const fn = () => { console.log(JSON.stringify({ args: process.argv.splice(2) })); };
                fs.writeFileSync('protocol-test.js', `const fn = ${fn.toString()}; fn();`);

                config.callbackURLTemplate = 'CALLBACK-URL';
                const customProtocols = {
                        test: {
                            createCommand: 'node ./protocol-test.js',
                            customProtocolFields: ['key1', 'key3']
                        }
                    },
                    protocols = loader.load({}, customProtocols, config, allow, logger, repository),
                    creationRequest = {
                        protocol: 'test',
                        port: 3000,
                        name: 'name',
                        stubs: [],
                        recordRequests: false,
                        key1: 'FIRST',
                        key2: 'SECOND'
                    },
                    server = await protocols.test.createServer(creationRequest, logger);

                assert.deepEqual(server.metadata.args, [
                    JSON.stringify({
                        port: 3000,
                        callbackURLTemplate: 'CALLBACK-URL',
                        loglevel: 'info',
                        key1: 'FIRST',
                        key2: 'SECOND'
                    })
                ]);
            });
        });
    });
});
