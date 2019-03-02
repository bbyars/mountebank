'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/impostersController'),
    FakeResponse = require('../fakes/fakeResponse'),
    FakeLogger = require('../fakes/fakeLogger'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt;

describe('ImpostersController', function () {
    let response;

    beforeEach(() => {
        response = FakeResponse.create();
    });

    describe('#get', function () {
        it('should send an empty array if no imposters', function () {
            const controller = Controller.create({}, {}, null, false);

            controller.get({ url: '/imposters' }, response);

            assert.deepEqual(response.body, { imposters: [] });
        });

        it('should send list JSON for all imposters by default', function () {
            const firstImposter = { toJSON: mock().returns('firstJSON') },
                secondImposter = { toJSON: mock().returns('secondJSON') },
                controller = Controller.create({}, { 1: firstImposter, 2: secondImposter }, null, false);

            controller.get({ url: '/imposters' }, response);

            assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
            assert.ok(firstImposter.toJSON.wasCalledWith({ replayable: false, removeProxies: false, list: true }), firstImposter.toJSON.message());
            assert.ok(secondImposter.toJSON.wasCalledWith({ replayable: false, removeProxies: false, list: true }), secondImposter.toJSON.message());
        });

        it('should send replayable JSON for all imposters if querystring present', function () {
            const firstImposter = { toJSON: mock().returns('firstJSON') },
                secondImposter = { toJSON: mock().returns('secondJSON') },
                controller = Controller.create({}, { 1: firstImposter, 2: secondImposter }, null, false);

            controller.get({ url: '/imposters?replayable=true' }, response);

            assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
            assert.ok(firstImposter.toJSON.wasCalledWith({ replayable: true, removeProxies: false, list: false }), firstImposter.toJSON.message());
            assert.ok(secondImposter.toJSON.wasCalledWith({ replayable: true, removeProxies: false, list: false }), secondImposter.toJSON.message());
        });

        it('should send replayable and removeProxies JSON for all imposters if querystring present', function () {
            const firstImposter = { toJSON: mock().returns('firstJSON') },
                secondImposter = { toJSON: mock().returns('secondJSON') },
                controller = Controller.create({}, { 1: firstImposter, 2: secondImposter }, null, false);

            controller.get({ url: '/imposters?replayable=true&removeProxies=true' }, response);

            assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
            assert.ok(firstImposter.toJSON.wasCalledWith({ replayable: true, removeProxies: true, list: false }), firstImposter.toJSON.message());
            assert.ok(secondImposter.toJSON.wasCalledWith({ replayable: true, removeProxies: true, list: false }), secondImposter.toJSON.message());
        });
    });

    describe('#post', function () {
        let request, imposter, imposters, Protocol, controller, logger;

        beforeEach(() => {
            request = { body: {}, socket: { remoteAddress: 'host', remotePort: 'port' } };
            imposter = {
                url: mock().returns('imposter-url'),
                toJSON: mock().returns('JSON')
            };
            imposters = {};
            Protocol = {
                name: 'http',
                Validator: {
                    create: mock().returns({ validate: mock().returns(Q({ isValid: true })) })
                },
                createImposterFrom: mock().returns(Q(imposter))
            };
            logger = FakeLogger.create();
            controller = Controller.create({ http: Protocol }, imposters, logger, false);
        });

        promiseIt('should return a 201 with the Location header set', function () {
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(() => {
                assert(response.headers.Location, 'http://localhost/servers/3535');
                assert.strictEqual(response.statusCode, 201);
            });
        });

        promiseIt('should return imposter JSON', function () {
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(() => {
                assert.strictEqual(response.body, 'JSON');
            });
        });

        promiseIt('should add new imposter to list of all imposters', function () {
            imposter.port = 3535;
            request.body = { protocol: 'http' };

            return controller.post(request, response).then(() => {
                assert.deepEqual(imposters, { 3535: imposter });
            });
        });

        promiseIt('should return a 400 for a floating point port', function () {
            request.body = { protocol: 'http', port: '123.45' };

            return controller.post(request, response).then(() => {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: 'bad data',
                        message: "invalid value for 'port'"
                    }]
                });
            });
        });

        promiseIt('should return a 400 for a missing protocol', function () {
            request.body = { port: 3535 };

            return controller.post(request, response).then(() => {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: 'bad data',
                        message: "'protocol' is a required field"
                    }]
                });
            });
        });

        promiseIt('should return a 400 for unsupported protocols', function () {
            request.body = { port: 3535, protocol: 'unsupported' };

            return controller.post(request, response).then(() => {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body.errors.length, 1);
                assert.strictEqual(response.body.errors[0].code, 'bad data');
            });
        });

        promiseIt('should aggregate multiple errors', function () {
            request.body = { port: -1, protocol: 'invalid' };

            return controller.post(request, response).then(() => {
                assert.strictEqual(response.body.errors.length, 2, response.body.errors);
            });
        });

        promiseIt('should return a 403 for insufficient access', function () {
            Protocol.createImposterFrom = mock().returns(Q.reject({
                code: 'insufficient access',
                key: 'value'
            }));
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(() => {
                assert.strictEqual(response.statusCode, 403);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: 'insufficient access',
                        key: 'value'
                    }]
                });
            });
        });

        promiseIt('should return a 400 for other protocol creation errors', function () {
            Protocol.createImposterFrom = mock().returns(Q.reject('ERROR'));
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(() => {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, { errors: ['ERROR'] });
            });
        });

        promiseIt('should not call protocol validation if there are common validation failures', function () {
            Protocol.Validator = { create: mock() };
            request.body = { protocol: 'invalid' };

            return controller.post(request, response).then(() => {
                assert.ok(!Protocol.Validator.create.wasCalled());
            });
        });

        promiseIt('should validate with Protocol if there are no common validation failures', function () {
            Protocol.validate = mock().returns(Q(['ERRORS']));
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(() => {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, { errors: ['ERRORS'] });
            });
        });
    });

    describe('#del', function () {
        const stopMock = () => mock().returns(Q(true));

        promiseIt('should delete all imposters', function () {
            const firstImposter = { stop: stopMock(), toJSON: mock().returns('firstJSON') },
                secondImposter = { stop: stopMock(), toJSON: mock().returns('secondJSON') },
                imposters = { 1: firstImposter, 2: secondImposter },
                controller = Controller.create({}, imposters, {}, false);

            return controller.del({ url: '/imposters' }, response).then(() => {
                assert.deepEqual(imposters, {});
            });
        });

        promiseIt('should call stop on all imposters', function () {
            const firstImposter = { stop: stopMock(), toJSON: mock().returns('firstJSON') },
                secondImposter = { stop: stopMock(), toJSON: mock().returns('secondJSON') },
                imposters = { 1: firstImposter, 2: secondImposter },
                controller = Controller.create({}, imposters, {}, false);

            return controller.del({ url: '/imposters' }, response).then(() => {
                assert(firstImposter.stop.wasCalled());
                assert(secondImposter.stop.wasCalled());
            });
        });

        promiseIt('should send replayable JSON for all imposters by default', function () {
            const firstImposter = { stop: stopMock(), toJSON: mock().returns('firstJSON') },
                secondImposter = { stop: stopMock(), toJSON: mock().returns('secondJSON') },
                imposters = { 1: firstImposter, 2: secondImposter },
                controller = Controller.create({}, imposters, {}, false);

            return controller.del({ url: '/imposters' }, response).then(() => {
                assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
                assert.ok(firstImposter.toJSON.wasCalledWith({ replayable: true, removeProxies: false }), firstImposter.toJSON.message());
                assert.ok(secondImposter.toJSON.wasCalledWith({ replayable: true, removeProxies: false }), secondImposter.toJSON.message());
            });
        });

        promiseIt('should send default JSON for all imposters if replayable is false on querystring', function () {
            const firstImposter = { stop: stopMock(), toJSON: mock().returns('firstJSON') },
                secondImposter = { stop: stopMock(), toJSON: mock().returns('secondJSON') },
                controller = Controller.create({}, { 1: firstImposter, 2: secondImposter }, {}, false);

            return controller.del({ url: '/imposters?replayable=false' }, response).then(() => {
                assert.ok(firstImposter.toJSON.wasCalledWith({ replayable: false, removeProxies: false }), firstImposter.toJSON.message());
                assert.ok(secondImposter.toJSON.wasCalledWith({ replayable: false, removeProxies: false }), secondImposter.toJSON.message());
            });
        });

        promiseIt('should send removeProxies JSON for all imposters if querystring present', function () {
            const firstImposter = { stop: stopMock(), toJSON: mock().returns('firstJSON') },
                secondImposter = { stop: stopMock(), toJSON: mock().returns('secondJSON') },
                controller = Controller.create({}, { 1: firstImposter, 2: secondImposter }, {}, false);

            return controller.del({ url: '/imposters?removeProxies=true' }, response).then(() => {
                assert.ok(firstImposter.toJSON.wasCalledWith({ replayable: true, removeProxies: true }), firstImposter.toJSON.message());
                assert.ok(secondImposter.toJSON.wasCalledWith({ replayable: true, removeProxies: true }), secondImposter.toJSON.message());
            });
        });
    });

    describe('#put', function () {
        let request, logger, Protocol;

        beforeEach(() => {
            request = { body: {}, socket: { remoteAddress: 'host', remotePort: 'port' } };
            logger = FakeLogger.create();
            Protocol = {
                name: 'http',
                Validator: {
                    create: mock().returns({ validate: mock().returns(Q({ isValid: true, errors: [] })) })
                }
            };
        });

        promiseIt('should return a 400 if the "imposters" key is not present', function () {
            const existingImposter = { stop: mock() },
                imposters = { 0: existingImposter },
                controller = Controller.create({ http: Protocol }, imposters, logger, false);

            request.body = {};

            return controller.put(request, response).then(() => {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: 'bad data',
                        message: "'imposters' is a required field"
                    }]
                });

                assert.deepEqual(imposters, { 0: existingImposter });
            });
        });

        promiseIt('should return an empty array if no imposters provided', function () {
            const existingImposter = { stop: mock() },
                imposters = { 0: existingImposter },
                controller = Controller.create({ http: Protocol }, imposters, logger, false);
            request.body = { imposters: [] };

            return controller.put(request, response).then(() => {
                assert.deepEqual(response.body, { imposters: [] });
                assert.deepEqual(imposters, {});
            });
        });

        promiseIt('should return imposter list JSON for all imposters', function () {
            let creates = 0;
            const firstImposter = { toJSON: mock().returns({ first: true }) },
                secondImposter = { toJSON: mock().returns({ second: true }) },
                imposters = [firstImposter, secondImposter],
                controller = Controller.create({ http: Protocol }, {}, logger, false);

            Protocol.createImposterFrom = () => {
                const result = imposters[creates];
                creates += 1;
                return result;
            };

            request.body = { imposters: [{ protocol: 'http' }, { protocol: 'http' }] };

            return controller.put(request, response).then(() => {
                assert.deepEqual(response.body, { imposters: [{ first: true }, { second: true }] });
                assert.ok(firstImposter.toJSON.wasCalledWith({ list: true }), firstImposter.toJSON.message());
                assert.ok(secondImposter.toJSON.wasCalledWith({ list: true }), secondImposter.toJSON.message());
            });
        });

        promiseIt('should replace imposters list', function () {
            let creates = 0;
            const oldImposter = { stop: mock() },
                imposters = { 0: oldImposter },
                firstImposter = { toJSON: mock().returns({ first: true }), port: 1 },
                secondImposter = { toJSON: mock().returns({ second: true }), port: 2 },
                impostersToCreate = [firstImposter, secondImposter],
                controller = Controller.create({ http: Protocol }, imposters, logger, false);

            Protocol.createImposterFrom = () => {
                const result = impostersToCreate[creates];
                creates += 1;
                return result;
            };

            request.body = { imposters: [{ protocol: 'http' }, { protocol: 'http' }] };

            return controller.put(request, response).then(() => {
                assert.deepEqual(imposters, { 1: firstImposter, 2: secondImposter });
                assert.ok(firstImposter.toJSON.wasCalledWith({ list: true }), firstImposter.toJSON.message());
                assert.ok(secondImposter.toJSON.wasCalledWith({ list: true }), secondImposter.toJSON.message());
            });
        });

        promiseIt('should return a 400 for any invalid imposter', function () {
            const controller = Controller.create({ http: Protocol }, {}, logger, false);

            request.body = { imposters: [{ protocol: 'http' }, {}] };

            return controller.put(request, response).then(() => {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: 'bad data',
                        message: "'protocol' is a required field"
                    }]
                });
            });
        });

        promiseIt('should return a 403 for insufficient access on any imposter', function () {
            let creates = 0;
            const controller = Controller.create({ http: Protocol }, {}, logger, false);
            Protocol.createImposterFrom = () => {
                creates += 1;
                if (creates === 2) {
                    return Q.reject({
                        code: 'insufficient access',
                        key: 'value'
                    });
                }
                else {
                    return Q({});
                }
            };

            request.body = { imposters: [{ protocol: 'http' }, { protocol: 'http' }] };

            return controller.put(request, response).then(() => {
                assert.strictEqual(response.statusCode, 403);
                assert.deepEqual(response.body, {
                    errors: [{
                        code: 'insufficient access',
                        key: 'value'
                    }]
                });
            });
        });
    });
});
