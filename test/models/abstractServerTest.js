'use strict';

const assert = require('assert'),
    events = require('events'),
    Q = require('q'),
    AbstractServer = require('../../src/models/abstractServer'),
    promiseIt = require('../testHelpers').promiseIt,
    inherit = require('../../src/util/inherit'),
    mock = require('../mock').mock,
    Logger = require('../fakes/fakeLogger');

describe('AbstractServer', function () {
    describe('#create', function () {
        let logger, implementation, baseServer;

        beforeEach(() => {
            logger = Logger.create();
            baseServer = inherit.from(events.EventEmitter, {
                listen: mock().returns(Q(3000)),
                metadata: mock(),
                close: mock(),
                formatRequestShort: mock(),
                formatRequest: mock(),
                formatResponse: mock(),
                errorHandler: mock(),
                respond: mock().returns(Q(true))
            });
            implementation = {
                protocolName: '',
                createServer: mock().returns(baseServer),
                Request: { createFrom: mock().returns(Q(true)) }
            };
        });

        promiseIt('should log when the server binds to the port', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger);
            implementation.protocolName = 'test';

            return Server.create({ port: 3000 }).then(() => {
                logger.info.assertLogged('[test:3000] Open for business...');
            });
        });

        promiseIt('should auto-assign port if none passed in', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger);
            baseServer.listen = mock().returns(Q(3000));
            implementation.protocolName = 'test';

            return Server.create({}).then(() => {
                logger.info.assertLogged('[test:3000] Open for business...');
            });
        });

        promiseIt('should log when the server is closed', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger);
            implementation.protocolName = 'test';
            baseServer.close = callback => { callback(); };

            return Server.create({ port: 3000 }).then(server => {
                server.close();
                logger.info.assertLogged('[test:3000] Ciao for now');
            });
        });

        promiseIt('should delegate addStub to baseServer', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger);
            baseServer.addStub = mock();

            return Server.create({ port: 3000 }).then(server => {
                server.addStub();
                assert.ok(baseServer.addStub.wasCalled());
            });
        });

        promiseIt('should delegate to server metadata', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger);
            baseServer.metadata.returns('metadata');

            return Server.create({ port: 3000 }).then(server => assert.strictEqual(server.metadata, 'metadata'));
        });

        promiseIt('should add options.name to server metadata', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger);
            baseServer.metadata.returns({ key: 'value' });

            return Server.create({ port: 3000, name: 'name' }).then(server =>
                assert.deepEqual(server.metadata, {
                    key: 'value',
                    name: 'name'
                }));
        });

        promiseIt('should log when connection established', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger),
                socket = inherit.from(events.EventEmitter, { remoteAddress: 'host', remotePort: 'port' });
            implementation.protocolName = 'test';

            return Server.create({ port: 3000 }).then(() => {
                baseServer.listeners('connection')[0](socket);
                logger.debug.assertLogged('[test:3000] host:port ESTABLISHED');
            });
        });

        promiseIt('should log socket errors', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger),
                socket = inherit.from(events.EventEmitter, { remoteAddress: 'host', remotePort: 'port' });
            implementation.protocolName = 'test';

            return Server.create({ port: 3000 }).then(() => {
                baseServer.listeners('connection')[0](socket);
                socket.listeners('error')[0]('ERROR');
                logger.error.assertLogged('[test:3000] host:port transmission error X=> "ERROR"');
            });
        });

        promiseIt('should log socket end and close', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger),
                socket = inherit.from(events.EventEmitter, { remoteAddress: 'host', remotePort: 'port' });
            implementation.protocolName = 'test';

            return Server.create({ port: 3000 }).then(() => {
                baseServer.listeners('connection')[0](socket);
                socket.listeners('end')[0]();
                socket.listeners('close')[0]();
                logger.debug.assertLogged('[test:3000] host:port LAST-ACK');
                logger.debug.assertLogged('[test:3000] host:port CLOSED');
            });
        });

        promiseIt('should log short request', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger),
                socket = inherit.from(events.EventEmitter, { remoteAddress: 'host', remotePort: 'port' });
            implementation.protocolName = 'test';
            baseServer.formatRequestShort.returns('request');

            return Server.create({ port: 3000 }).then(() => {
                baseServer.listeners('request')[0](socket, {});
                logger.info.assertLogged('[test:3000] host:port => request');
            });
        });

        promiseIt('should log full request', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger),
                socket = inherit.from(events.EventEmitter, { remoteAddress: 'host', remotePort: 'port' });
            implementation.protocolName = 'test';
            baseServer.formatRequest.returns('full request');

            return Server.create({ port: 3000 }).then(() => {
                baseServer.listeners('request')[0](socket, {}, () => {
                    logger.debug.assertLogged('[test:3000] host:port => "full request"');
                });
                return Q.delay(1);
            });
        });

        promiseIt('should record simplified requests if recordRequests is true', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger);
            implementation.Request.createFrom.returns(Q({ id: 'simple request' }));

            return Server.create({ port: 3000 }).then(server => {
                baseServer.listeners('request')[0]({}, {}, () => {
                    server.requests.forEach(request => {
                        if (request.timestamp) {
                            request.timestamp = 'NOW';
                        }
                    });
                    assert.deepEqual(server.requests, [{ id: 'simple request', timestamp: 'NOW' }]);
                });
                return Q.delay(1);
            });
        });

        promiseIt('should not record simplified requests if recordRequests is false', function () {
            const Server = AbstractServer.implement(implementation, false, false, logger);
            implementation.Request.createFrom.returns(Q({ id: 'simple request' }));

            return Server.create({ port: 3000 }).then(server => {
                baseServer.listeners('request')[0]({}, {}, () => {
                    assert.deepEqual(server.requests, []);
                });
                return Q.delay(1);
            });
        });

        promiseIt('should call the base server to respond', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger);
            implementation.Request.createFrom.returns(Q({ id: 'simple request' }));

            return Server.create({ port: 3000 }).then(() => {
                baseServer.listeners('request')[0]({}, {}, () => {
                    assert.ok(baseServer.respond.wasCalled(), baseServer.respond.message());
                });
                return Q.delay(1);
            });
        });

        promiseIt('should log response', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger),
                socket = inherit.from(events.EventEmitter, { remoteAddress: 'host', remotePort: 'port' });
            implementation.protocolName = 'test';
            implementation.Request.createFrom.returns(Q({ id: 'simple request' }));
            baseServer.formatResponse.returns('response');

            return Server.create({ port: 3000 }).then(() => {
                baseServer.listeners('request')[0](socket, {}, () => {
                    logger.debug.assertLogged('[test:3000] host:port <= "response"');
                });
                return Q.delay(1);
            });
        });

        promiseIt('should log error and call server error handler if respond fails', function () {
            const Server = AbstractServer.implement(implementation, true, false, logger),
                socket = inherit.from(events.EventEmitter, { remoteAddress: 'host', remotePort: 'port' });
            implementation.protocolName = 'test';
            implementation.Request.createFrom.returns(Q({ id: 'simple request' }));
            baseServer.respond = () => { throw 'BOOM'; }; // eslint-disable-line no-throw-literal

            return Server.create({ port: 3000 }).then(() => {
                baseServer.listeners('request')[0](socket, 'originalRequest', () => {
                    logger.error.assertLogged('[test:3000] host:port X=> "BOOM"');
                    assert.ok(baseServer.errorHandler.wasCalledWith('BOOM', 'originalRequest'), baseServer.errorHandler.message());
                });
                return Q.delay(1);
            });
        });
    });
});
