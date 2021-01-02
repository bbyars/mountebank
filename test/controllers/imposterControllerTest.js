'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/imposterController'),
    ImpostersRepo = require('../../src/models/inMemoryImpostersRepository'),
    FakeResponse = require('../fakes/fakeResponse');

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

describe('ImposterController', function () {
    describe('#get', function () {
        it('should return JSON for imposter at given id', async function () {
            const response = FakeResponse.create(),
                first = { port: 1, toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.get({ url: '/imposters/2', params: { id: 2 } }, response);

            assert.strictEqual(response.body, 'secondJSON');
        });

        it('should return replayable JSON for imposter at given id if replayable querystring set', async function () {
            const response = FakeResponse.create(),
                firstImposter = { port: 1, toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(firstImposter));
            await repo.add(imposterize(second));
            await controller.get({ url: '/imposters/2?replayable=true', params: { id: 2 } }, response);

            assert.strictEqual(response.body, 'secondJSON');
            assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: false }), second.toJSON.message());
        });

        it('should return removeProxies JSON for imposter at given id if removeProxies querystring set', async function () {
            const response = FakeResponse.create(),
                first = { port: 1, toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.get({ url: '/imposters/2?removeProxies=true', params: { id: 2 } }, response);

            assert.strictEqual(response.body, 'secondJSON');
            assert.ok(second.toJSON.wasCalledWith({ replayable: false, removeProxies: true }), second.toJSON.message());
        });

        it('should return replayable and removeProxies JSON for imposter at given id if both querystring values set', async function () {
            const response = FakeResponse.create(),
                first = { port: 1, toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.get({ url: '/imposters/2?removeProxies=true&replayable=true', params: { id: 2 } }, response);

            assert.strictEqual(response.body, 'secondJSON');
            assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: true }), second.toJSON.message());
        });

        it('should return normal JSON for imposter at given id if both replayable and removeProxies querystrings are false', async function () {
            const response = FakeResponse.create(),
                first = { port: 1, toJSON: mock().returns(Promise.resolve('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Promise.resolve('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(first));
            await repo.add(imposterize(second));
            await controller.get({ url: '/imposters/2?replayable=false&removeProxies=false', params: { id: 2 } }, response);

            assert.strictEqual(response.body, 'secondJSON');
            assert.ok(second.toJSON.wasCalledWith({ replayable: false, removeProxies: false }), second.toJSON.message());
        });
    });

    describe('#del', function () {
        it('should stop the imposter', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Promise.resolve(true)),
                    toJSON: mock().returns(Promise.resolve('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(imposter));
            await controller.del({ url: '/imposters/1', params: { id: 1 } }, response);

            assert.ok(imposter.stop.wasCalled());
        });

        it('should remove the imposter from the list', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Promise.resolve(true)),
                    toJSON: mock().returns(Promise.resolve('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(imposter));
            await controller.del({ url: '/imposters/1', params: { id: 1 } }, response);

            const all = await repo.all();
            assert.deepEqual(all, []);
        });

        it('should send request even if no imposter exists', async function () {
            const response = FakeResponse.create(),
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await controller.del({ url: '/imposters/1', params: { id: 1 } }, response);
            assert.deepEqual(response.body, {});
        });

        it('should return replayable JSON for imposter at given id if replayable querystring set', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Promise.resolve(true)),
                    toJSON: mock().returns(Promise.resolve('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(imposter));
            await controller.del({ url: '/imposters/1?replayable=true', params: { id: 1 } }, response);

            assert.ok(imposter.toJSON.wasCalledWith({ replayable: true, removeProxies: false }), imposter.toJSON.message());
        });

        it('should return removeProxies JSON for imposter at given id if removeProxies querystring set', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Promise.resolve(true)),
                    toJSON: mock().returns(Promise.resolve('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(imposter));
            await controller.del({ url: '/imposters/1?removeProxies=true', params: { id: 1 } }, response);

            assert.ok(imposter.toJSON.wasCalledWith({ replayable: false, removeProxies: true }), imposter.toJSON.message());
        });

        it('should return replayable and removeProxies JSON for imposter at given id if both querystring values set', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Promise.resolve(true)),
                    toJSON: mock().returns(Promise.resolve('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(imposter));
            await controller.del({ url: '/imposters/1?removeProxies=true&replayable=true', params: { id: 1 } }, response);

            assert.ok(imposter.toJSON.wasCalledWith({ replayable: true, removeProxies: true }), imposter.toJSON.message());
        });

        it('should send default JSON for the deleted the imposter if both replayable and removeProxies querystrings are missing', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Promise.resolve(true)),
                    toJSON: mock().returns(Promise.resolve('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            await repo.add(imposterize(imposter));
            await controller.del({ url: '/imposters/1', params: { id: 1 } }, response);

            assert.ok(imposter.toJSON.wasCalledWith({ replayable: false, removeProxies: false }), imposter.toJSON.message());
        });
    });

    describe('#putStubs', function () {
        it('should return a 400 if no stubs element', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    toJSON: mock().returns(Promise.resolve({})),
                    overwriteStubs: mock()
                },
                logger = require('../fakes/fakeLogger').create(),
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, logger, false);

            await repo.add(imposterize(imposter));
            await controller.putStubs({ params: { id: 1 }, body: {} }, response);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors.length, 1);
            assert.strictEqual(response.body.errors[0].code, 'bad data');
        });

        it('should return a 400 if no stubs is not an array', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    toJSON: mock().returns(Promise.resolve({})),
                    overwriteStubs: mock()
                },
                repo = ImpostersRepo.create(),
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({}, repo, logger, false),
                request = {
                    params: { id: 1 },
                    body: { stubs: 1 }
                };

            await repo.add(imposterize(imposter));
            await controller.putStubs(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors.length, 1);
            assert.strictEqual(response.body.errors[0].code, 'bad data');
        });

        it('should return a 400 if no stub fails dry run validation', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    creationRequest: { port: 1, protocol: 'test', stubs: [{}] },
                    toJSON: mock().returns(Promise.resolve({ port: 1, protocol: 'test', stubs: [{}] }))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1 },
                    body: { stubs: [{ responses: [{ invalid: 1 }] }] }
                };

            await repo.add(imposterize(imposter));
            await controller.putStubs(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors.length, 1);
            assert.strictEqual(response.body.errors[0].code, 'bad data');
        });

        it('should return a 400 if trying to add injection without --allowInjection set', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    toJSON: mock().returns(Promise.resolve({ protocol: 'test' }))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1 },
                    body: { stubs: [{ responses: [{ inject: '() => {}' }] }] }
                };

            await repo.add(imposterize(imposter));
            await controller.putStubs(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors.length, 1);
            assert.strictEqual(response.body.errors[0].code, 'invalid injection');
        });
    });

    describe('#putStub', function () {
        it('should return a 404 if stubIndex is not an integer', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    stubsJSON: mock().returns(Promise.resolve([]))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1, stubIndex: 'test' },
                    body: { stubs: [{ responses: [{ is: 'response' }] }] }
                };

            await repo.add(imposterize(imposter));
            await controller.putStub(request, response);

            assert.strictEqual(response.statusCode, 404);
            assert.strictEqual(response.body.errors.length, 1);
            assert.deepEqual(response.body.errors[0], {
                code: 'bad data',
                message: "'stubIndex' must be a valid integer, representing the array index position of the stub to replace"
            });
        });

        it('should return a 404 if stubIndex is less than 0', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    stubsJSON: mock().returns(Promise.resolve([]))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1, stubIndex: -1 },
                    body: { stubs: [{ responses: [{ is: 'response' }] }] }
                };

            await repo.add(imposterize(imposter));
            await controller.putStub(request, response);

            assert.strictEqual(response.statusCode, 404);
            assert.strictEqual(response.body.errors.length, 1);
            assert.deepEqual(response.body.errors[0], {
                code: 'bad data',
                message: "'stubIndex' must be a valid integer, representing the array index position of the stub to replace"
            });
        });

        it('should return a 404 if stubIndex is greater then highest index of stubs array', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    stubsJSON: mock().returns(Promise.resolve([0, 1, 2]))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1, stubIndex: 3 },
                    body: { stubs: [{ responses: [{ is: 'response' }] }] }
                };

            await repo.add(imposterize(imposter));
            await controller.putStub(request, response);

            assert.strictEqual(response.statusCode, 404);
            assert.strictEqual(response.body.errors.length, 1);
            assert.deepEqual(response.body.errors[0], {
                code: 'bad data',
                message: "'stubIndex' must be a valid integer, representing the array index position of the stub to replace"
            });
        });

        it('should return a 400 if no stub fails dry run validation', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    toJSON: mock().returns(Promise.resolve({ protocol: 'test' })),
                    creationRequest: { port: 1, protocol: 'test', stubs: [{}] }
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1, stubIndex: 0 },
                    body: { responses: [{ INVALID: 'response' }] }
                };

            await repo.add(imposter);
            await controller.putStub(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors.length, 1);
            assert.deepEqual(response.body.errors[0], {
                code: 'bad data',
                message: 'unrecognized response type',
                source: { INVALID: 'response' }
            });
        });

        it('should return a 400 if no adding inject without --allowInjection', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    toJSON: mock().returns(Promise.resolve({ protocol: 'test' })),
                    creationRequest: { port: 1, protocol: 'test', stubs: [{}] }
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1, stubIndex: 0 },
                    body: { responses: [{ inject: '() => {}' }] }
                };

            await repo.add(imposter);
            await controller.putStub(request, response);

            assert.strictEqual(response.statusCode, 400);
            assert.strictEqual(response.body.errors.length, 1);
            assert.deepEqual(response.body.errors[0], {
                code: 'invalid injection',
                message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                source: { responses: [{ inject: '() => {}' }] }
            });
        });
    });

    describe('#deleteStub', function () {
        it('should return a 404 if stubIndex is greater then highest index of stubs array', async function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    stubsJSON: mock().returns(Promise.resolve([0, 1, 2]))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1, stubIndex: 3 },
                    body: { stubs: [{ responses: [{ is: 'response' }] }] }
                };

            await repo.add(imposterize(imposter));
            await controller.deleteStub(request, response);

            assert.strictEqual(response.statusCode, 404);
            assert.strictEqual(response.body.errors.length, 1);
            assert.deepEqual(response.body.errors[0], {
                code: 'bad data',
                message: "'stubIndex' must be a valid integer, representing the array index position of the stub to replace"
            });
        });
    });
});
