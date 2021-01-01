'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/impostersController'),
    FakeResponse = require('../fakes/fakeResponse'),
    FakeLogger = require('../fakes/fakeLogger'),
    ImpostersRepo = require('../../src/models/inMemoryImpostersRepository'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt;

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

    beforeEach(() => {
        response = FakeResponse.create();
    });

    describe('#get', function () {
        it('should send an empty array if no imposters', async function () {
            const impostersRepo = ImpostersRepo.create(),
                controller = Controller.create({}, impostersRepo, null, false);

            await controller.get({ url: '/imposters' }, response);
            assert.deepEqual(response.body, { imposters: [] });
        });

        promiseIt('should send list JSON for all imposters by default', function () {
            const first = { port: 1, toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, null, false);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.get({ url: '/imposters' }, response))
                .then(() => {
                    assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
                    assert.ok(first.toJSON.wasCalledWith({ replayable: false, removeProxies: false, list: true }), first.toJSON.message());
                    assert.ok(second.toJSON.wasCalledWith({ replayable: false, removeProxies: false, list: true }), second.toJSON.message());
                });
        });

        promiseIt('should send replayable JSON for all imposters if querystring present', function () {
            const first = { port: 1, toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, null, false);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.get({ url: '/imposters?replayable=true' }, response))
                .then(() => {
                    assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
                    assert.ok(first.toJSON.wasCalledWith({ replayable: true, removeProxies: false, list: false }), first.toJSON.message());
                    assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: false, list: false }), second.toJSON.message());
                });
        });

        promiseIt('should send replayable and removeProxies JSON for all imposters if querystring present', function () {
            const first = { port: 1, toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, null, false);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.get({ url: '/imposters?replayable=true&removeProxies=true' }, response))
                .then(() => {
                    assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
                    assert.ok(first.toJSON.wasCalledWith({ replayable: true, removeProxies: true, list: false }), first.toJSON.message());
                    assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: true, list: false }), second.toJSON.message());
                });
        });
    });

    describe('#post', function () {
        let request, imposter, imposters, Protocol, controller, logger;

        beforeEach(() => {
            request = { body: {}, socket: { remoteAddress: 'host', remotePort: 'port' } };
            imposter = {
                url: 'imposter-url',
                toJSON: mock().returns(Q('JSON'))
            };
            imposters = ImpostersRepo.create();
            Protocol = {
                name: 'http',
                Validator: {
                    create: mock().returns({ validate: mock().returns(Q({ isValid: true })) })
                },
                createImposterFrom: creationRequest => {
                    imposter.creationRequest = creationRequest;
                    return Q(imposter);
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
            Protocol.createImposterFrom = mock().returns(Q.reject({
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
            Protocol.createImposterFrom = mock().returns(Q.reject('ERROR'));
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
            Protocol.validate = mock().returns(Q(['ERRORS']));
            request.body = { port: 3535, protocol: 'http' };

            await controller.post(request, response);
            assert.strictEqual(response.statusCode, 400);
            assert.deepEqual(response.body, { errors: ['ERRORS'] });
        });
    });

    describe('#del', function () {
        const stopMock = () => mock().returns(Q(true));

        promiseIt('should delete all imposters', function () {
            const first = { port: 1, stop: stopMock(), toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, stop: stopMock(), toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, {}, false);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.del({ url: '/imposters' }, response))
                .then(() => repo.all())
                .then(allImposters => {
                    assert.deepEqual(allImposters, []);
                });
        });

        promiseIt('should call stop on all imposters', function () {
            const first = { port: 1, stop: mock(), toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, stop: mock(), toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, {}, false);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.del({ url: '/imposters' }, response))
                .then(() => {
                    assert(first.stop.wasCalled());
                    assert(second.stop.wasCalled());
                });
        });

        promiseIt('should send replayable JSON for all imposters by default', function () {
            const first = { port: 1, stop: stopMock(), toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, stop: stopMock(), toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, {}, false);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.del({ url: '/imposters' }, response))
                .then(() => {
                    assert.deepEqual(response.body, { imposters: ['firstJSON', 'secondJSON'] });
                    assert.ok(first.toJSON.wasCalledWith({ replayable: true, removeProxies: false }), first.toJSON.message());
                    assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: false }), second.toJSON.message());
                });
        });

        promiseIt('should send default JSON for all imposters if replayable is false on querystring', function () {
            const first = { port: 1, stop: stopMock(), toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, stop: stopMock(), toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, {}, false);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.del({ url: '/imposters?replayable=false' }, response))
                .then(() => {
                    assert.ok(first.toJSON.wasCalledWith({ replayable: false, removeProxies: false }), first.toJSON.message());
                    assert.ok(second.toJSON.wasCalledWith({ replayable: false, removeProxies: false }), second.toJSON.message());
                });
        });

        promiseIt('should send removeProxies JSON for all imposters if querystring present', function () {
            const first = { port: 1, stop: mock(), toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, stop: mock(), toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, {}, false);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.del({ url: '/imposters?removeProxies=true' }, response))
                .then(() => {
                    assert.ok(first.toJSON.wasCalledWith({ replayable: true, removeProxies: true }),
                        first.toJSON.message());
                    assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: true }),
                        second.toJSON.message());
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
            const existingImposter = { port: 0, stop: mock() },
                repo = ImpostersRepo.create(),
                controller = Controller.create({ http: Protocol }, repo, logger, false);

            request.body = {};

            return repo.add(imposterize(existingImposter))
                .then(() => controller.put(request, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.deepEqual(response.body, {
                        errors: [{
                            code: 'bad data',
                            message: "'imposters' is a required field"
                        }]
                    });

                    return repo.all();
                }).then(allImposters => {
                    const ports = allImposters.map(imposter => imposter.port);
                    assert.deepEqual(ports, [0]);
                });
        });

        promiseIt('should return an empty array if no imposters provided', function () {
            const existingImposter = { port: 0, stop: mock() },
                repo = ImpostersRepo.create(),
                controller = Controller.create({ http: Protocol }, repo, logger, false);
            request.body = { imposters: [] };

            return repo.add(imposterize(existingImposter))
                .then(() => controller.put(request, response))
                .then(() => {
                    assert.deepEqual(response.body, { imposters: [] });
                    return repo.all();
                }).then(allImposters => {
                    assert.deepEqual(allImposters, []);
                });
        });

        it('should return imposter list JSON for all imposters', async function () {
            let creates = 0;
            const first = { port: 1, toJSON: mock().returns(Q({ first: true })) },
                second = { port: 2, toJSON: mock().returns(Q({ second: true })) },
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

        promiseIt('should replace imposters list', function () {
            let creates = 0;
            const oldImposter = { port: 0, stop: mock() },
                repo = ImpostersRepo.create(),
                first = { toJSON: mock().returns(Q({ first: true })), port: 1 },
                second = { toJSON: mock().returns(Q({ second: true })), port: 2 },
                impostersToCreate = [first, second],
                controller = Controller.create({ http: Protocol }, repo, logger, false);

            Protocol.createImposterFrom = creationRequest => {
                const result = impostersToCreate[creates];
                result.creationRequest = creationRequest;
                creates += 1;
                return result;
            };

            request.body = { imposters: [{ protocol: 'http' }, { protocol: 'http' }] };

            return repo.add(imposterize(oldImposter))
                .then(() => controller.put(request, response))
                .then(() => repo.all())
                .then(allImposters => {
                    assert.deepEqual(allImposters, [first, second]);
                    assert.ok(first.toJSON.wasCalledWith({ list: true }), first.toJSON.message());
                    assert.ok(second.toJSON.wasCalledWith({ list: true }), second.toJSON.message());
                });
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
                    deleteAll: mock().returns(Q(true)),
                    imposters: {}
                },
                controller = Controller.create({ http: Protocol }, imposters, logger, false);

            Protocol.createImposterFrom = () => {
                creates += 1;
                if (creates === 2) {
                    return Q.reject({
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
