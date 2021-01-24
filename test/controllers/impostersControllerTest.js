'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/impostersController'),
    FakeResponse = require('../fakes/fakeResponse'),
    FakeLogger = require('../fakes/fakeLogger'),
    ImpostersRepo = require('../../src/models/inMemoryImpostersRepository'),
    Request = require('../fakes/fakeRequest');

function imposterize (config) {
    const cloned = JSON.parse(JSON.stringify(config)),
        result = { creationRequest: cloned };
    Object.keys(config).forEach(key => {
        if (typeof config[key] === 'function') {
            result[key] = config[key];
        }
    });
    result.port = config.port;
    return result;
}

describe('ImpostersController', function () {
    let response;

    beforeEach(function () {
        response = FakeResponse.create();
    });

    describe('#get', function () {
        it('should send an empty array if no imposters', async function () {
            const impostersRepo = ImpostersRepo.create(),
                controller = Controller.create({}, impostersRepo, null, false);

            await controller.get(Request.to('/imposters'), response);
            assert.deepEqual(response.body, { imposters: [] });
        });

        it('should send list JSON for all imposters by default', async function () {
            const first = { port: 1, toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, null, false);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.get(Request.to('/imposters'), response);

            assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
            assert.ok(first.toJSON.wasCalledWith({ replayable: false, removeProxies: false, list: true }), first.toJSON.message());
            assert.ok(second.toJSON.wasCalledWith({ replayable: false, removeProxies: false, list: true }), second.toJSON.message());
        });

        it('should send replayable JSON for all imposters if querystring present', async function () {
            const first = { port: 1, toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, null, false);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.get(Request.to('/imposters?replayable=true'), response);

            assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
            assert.ok(first.toJSON.wasCalledWith({ replayable: true, removeProxies: false, list: false }), first.toJSON.message());
            assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: false, list: false }), second.toJSON.message());
        });

        it('should send replayable and removeProxies JSON for all imposters if querystring present', async function () {
            const first = { port: 1, toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, null, false);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.get(Request.to('/imposters?replayable=true&removeProxies=true'), response);

            assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
            assert.ok(first.toJSON.wasCalledWith({ replayable: true, removeProxies: true, list: false }), first.toJSON.message());
            assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: true, list: false }), second.toJSON.message());
        });
    });

    describe('#post', function () {
        let request, imposter, imposters, Protocol, controller, logger;

        beforeEach(function () {
            request = { body: {}, socket: { remoteAddress: 'host', remotePort: 'port' } };
            imposter = {
                url: 'imposter-url',
                toJSON: mock().returns(Promise.resolve('JSON'))
            };
            imposters = ImpostersRepo.create();
            Protocol = {
                name: 'http',
                Validator: {
                    create: mock().returns({ validate: mock().returns(Promise.resolve({ isValid: true })) })
                },
                createImposterFrom: creationRequest => {
                    imposter.creationRequest = creationRequest;
                    return Promise.resolve(imposter);
                }
            };
            logger = FakeLogger.create();
            controller = Controller.create({ http: Protocol }, imposters, logger, false);
        });

        it('should return a 201 with the Location header set', async function () {
            request.body = { port: 3535, protocol: 'http' };
            imposter.url = 'http://localhost/servers/3535';

            await controller.post(request, response);

            assert.strictEqual(response.headers.Location, 'http://localhost/servers/3535');
            assert.strictEqual(response.statusCode, 201);
        });

        it('should return imposter JSON', async function () {
            request.body = { port: 3535, protocol: 'http' };

            await controller.post(request, response);

            assert.strictEqual(response.body, 'JSON');
        });

        it('should add new imposter to list of all imposters', async function () {
            imposter.port = 3535;
            request.body = { protocol: 'http' };

            await controller.post(request, response);

            const allImposters = await imposters.all();
            assert.deepEqual(allImposters, [imposter]);
        });

        it('should return a 400 for a floating point port', async function () {
            request.body = { protocol: 'http', port: '123.45' };

            await controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: 'bad data',
                    message: "invalid value for 'port'"
                }]
            });
        });

        it('should return a 400 for a missing protocol', async function () {
            request.body = { port: 3535 };

            await controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: 'bad data',
                    message: "'protocol' is a required field"
                }]
            });
        });

        it('should return a 400 for unsupported protocols', async function () {
            request.body = { port: 3535, protocol: 'unsupported' };

            await controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors.length, 1);
            assert.strictEqual(response.body.errors[0].code, 'bad data');
        });

        it('should aggregate multiple errors', async function () {
            request.body = { port: -1, protocol: 'invalid' };

            await controller.post(request, response);

            assert.strictEqual(response.body.errors.length, 2, response.body.errors);
        });

        it('should return a 403 for insufficient access', async function () {
            Protocol.createImposterFrom = mock().returns(Promise.reject({
                code: 'insufficient access',
                key: 'value'
            }));
            request.body = { port: 3535, protocol: 'http' };

            await controller.post(request, response);

            assert.strictEqual(response.statusCode, 403);
            assert.deepEqual(response.body, {
                errors: [{
                    code: 'insufficient access',
                    key: 'value'
                }]
            });
        });

        it('should return a 400 for other protocol creation errors', async function () {
            Protocol.createImposterFrom = mock().returns(Promise.reject('ERROR'));
            request.body = { port: 3535, protocol: 'http' };

            await controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, { errors: ['ERROR'] });
        });

        it('should not call protocol validation if there are common validation failures', async function () {
            Protocol.Validator = { create: mock() };
            request.body = { protocol: 'invalid' };

            await controller.post(request, response);

            assert.ok(!Protocol.Validator.create.wasCalled());
        });

        it('should validate with Protocol if there are no common validation failures', async function () {
            Protocol.validate = mock().returns(Promise.resolve(['ERRORS']));
            request.body = { port: 3535, protocol: 'http' };

            await controller.post(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, { errors: ['ERRORS'] });
        });
    });

    describe('#del', function () {
        const stopMock = () => mock().returns(Promise.resolve(true));

        it('should delete all imposters', async function () {
            const first = { port: 1, stop: stopMock(), toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, stop: stopMock(), toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, {}, false);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.del(Request.to('/imposters'), response);

            const allImposters = await repo.all();
            assert.deepEqual(allImposters, []);
        });

        it('should call stop on all imposters', async function () {
            const first = { port: 1, stop: mock(), toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, stop: mock(), toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, {}, false);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.del(Request.to('/imposters'), response);

            assert.ok(first.stop.wasCalled());
            assert.ok(second.stop.wasCalled());
        });

        it('should send replayable JSON for all imposters by default', async function () {
            const first = { port: 1, stop: stopMock(), toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, stop: stopMock(), toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, {}, false);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.del(Request.to('/imposters'), response);

            assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
            assert.ok(first.toJSON.wasCalledWith({ replayable: true, removeProxies: false }), first.toJSON.message());
            assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: false }), second.toJSON.message());
        });

        it('should send default JSON for all imposters if replayable is false on querystring', async function () {
            const first = { port: 1, stop: stopMock(), toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, stop: stopMock(), toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, {}, false);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.del(Request.to('/imposters?replayable=false'), response);

            assert.ok(first.toJSON.wasCalledWith({ replayable: false, removeProxies: false }), first.toJSON.message());
            assert.ok(second.toJSON.wasCalledWith({ replayable: false, removeProxies: false }), second.toJSON.message());
        });

        it('should send removeProxies JSON for all imposters if querystring present', async function () {
            const first = { port: 1, stop: mock(), toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, stop: mock(), toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, {}, false);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.del(Request.to('/imposters?removeProxies=true'), response);

            assert.ok(first.toJSON.wasCalledWith({ replayable: true, removeProxies: true }),
                first.toJSON.message());
            assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: true }),
                second.toJSON.message());
        });
    });

    describe('#put', function () {
        let request, logger, Protocol;

        beforeEach(function () {
            request = { body: {}, socket: { remoteAddress: 'host', remotePort: 'port' } };
            logger = FakeLogger.create();
            Protocol = {
                name: 'http',
                Validator: {
                    create: mock().returns({ validate: mock().returns(Promise.resolve({ isValid: true, errors: [] })) })
                }
            };
        });

        it('should return a 400 if the "imposters" key is not present', async function () {
            const existingImposter = { port: 0, stop: mock() },
                repo = ImpostersRepo.create(),
                controller = Controller.create({ http: Protocol }, repo, logger, false);
            request.body = {};

            await repo.add(imposterize(existingImposter));
            await controller.put(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: 'bad data',
                    message: "'imposters' is a required field"
                }]
            });

            const allImposters = await repo.all();
            const ports = allImposters.map(imposter => imposter.port);
            assert.deepEqual(ports, [0]);
        });

        it('should return an empty array if no imposters provided', async function () {
            const existingImposter = { port: 0, stop: mock() },
                repo = ImpostersRepo.create(),
                controller = Controller.create({ http: Protocol }, repo, logger, false);
            request.body = { imposters: [] };

            await repo.add(imposterize(existingImposter));
            await controller.put(request, response);

            assert.deepEqual(response.body, { imposters: [] });
            const allImposters = await repo.all();
            assert.deepEqual(allImposters, []);
        });

        it('should return imposter list JSON for all imposters', async function () {
            let creates = 0;
            const first = { port: 1, toJSON: mock().returns(Promise.resolve({ first: true })) },
                second = { port: 2, toJSON: mock().returns(Promise.resolve({ second: true })) },
                imposters = [first, second],
                impostersRepo = ImpostersRepo.create(),
                controller = Controller.create({ http: Protocol }, impostersRepo, logger, false);

            Protocol.createImposterFrom = creationRequest => {
                const result = imposters[creates];
                result.creationRequest = creationRequest;
                creates += 1;
                return result;
            };

            request.body = { imposters: [{ protocol: 'http' }, { protocol: 'http' }] };
            await controller.put(request, response);

            assert.deepEqual(response.body, { imposters: [{ first: true }, { second: true }] });
            assert.ok(first.toJSON.wasCalledWith({ list: true }), first.toJSON.message());
            assert.ok(second.toJSON.wasCalledWith({ list: true }), second.toJSON.message());
        });

        it('should replace imposters list', async function () {
            let creates = 0;
            const oldImposter = { port: 0, stop: mock() },
                repo = ImpostersRepo.create(),
                first = { toJSON: mock().returns(Promise.resolve({ first: true })), port: 1 },
                second = { toJSON: mock().returns(Promise.resolve({ second: true })), port: 2 },
                impostersToCreate = [first, second],
                controller = Controller.create({ http: Protocol }, repo, logger, false);

            Protocol.createImposterFrom = creationRequest => {
                const result = impostersToCreate[creates];
                result.creationRequest = creationRequest;
                creates += 1;
                return result;
            };

            request.body = { imposters: [{ protocol: 'http' }, { protocol: 'http' }] };

            await repo.add(imposterize(oldImposter));
            await controller.put(request, response);

            const allImposters = await repo.all();
            assert.deepEqual(allImposters, [first, second]);
            assert.ok(first.toJSON.wasCalledWith({ list: true }), first.toJSON.message());
            assert.ok(second.toJSON.wasCalledWith({ list: true }), second.toJSON.message());
        });

        it('should return a 400 for any invalid imposter', async function () {
            const controller = Controller.create({ http: Protocol }, { imposters: {} }, logger, false);

            request.body = { imposters: [{ protocol: 'http' }, {}] };
            await controller.put(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, {
                errors: [{
                    code: 'bad data',
                    message: "'protocol' is a required field"
                }]
            });
        });

        it('should return a 403 for insufficient access on any imposter', async function () {
            let creates = 0;
            const imposters = {
                    deleteAll: mock().returns(Promise.resolve(true)),
                    imposters: {}
                },
                controller = Controller.create({ http: Protocol }, imposters, logger, false);

            Protocol.createImposterFrom = () => {
                creates += 1;
                if (creates === 2) {
                    return Promise.reject({
                        code: 'insufficient access',
                        key: 'value'
                    });
                }
                else {
                    return Promise.resolve({});
                }
            };

            request.body = { imposters: [{ protocol: 'http' }, { protocol: 'http' }] };
            await controller.put(request, response);

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
