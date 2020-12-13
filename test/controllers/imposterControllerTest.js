'use strict';

const assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/imposterController'),
    ImpostersRepo = require('../../src/models/inMemoryImpostersRepository'),
    FakeResponse = require('../fakes/fakeResponse'),
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

describe('ImposterController', function () {
    describe('#get', function () {
        promiseIt('should return JSON for imposter at given id', function () {
            const response = FakeResponse.create(),
                first = { port: 1, toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.get({ url: '/imposters/2', params: { id: 2 } }, response))
                .then(() => {
                    assert.strictEqual(response.body, 'secondJSON');
                });
        });

        promiseIt('should return replayable JSON for imposter at given id if replayable querystring set', function () {
            const response = FakeResponse.create(),
                firstImposter = { port: 1, toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(firstImposter))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.get({ url: '/imposters/2?replayable=true', params: { id: 2 } }, response))
                .then(() => {
                    assert.strictEqual(response.body, 'secondJSON');
                    assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: false }), second.toJSON.message());
                });
        });

        promiseIt('should return removeProxies JSON for imposter at given id if removeProxies querystring set', function () {
            const response = FakeResponse.create(),
                first = { port: 1, toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.get({ url: '/imposters/2?removeProxies=true', params: { id: 2 } }, response))
                .then(() => {
                    assert.strictEqual(response.body, 'secondJSON');
                    assert.ok(second.toJSON.wasCalledWith({ replayable: false, removeProxies: true }), second.toJSON.message());
                });
        });

        promiseIt('should return replayable and removeProxies JSON for imposter at given id if both querystring values set', function () {
            const response = FakeResponse.create(),
                first = { port: 1, toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.get({ url: '/imposters/2?removeProxies=true&replayable=true', params: { id: 2 } }, response))
                .then(() => {
                    assert.strictEqual(response.body, 'secondJSON');
                    assert.ok(second.toJSON.wasCalledWith({ replayable: true, removeProxies: true }), second.toJSON.message());
                });
        });

        promiseIt('should return normal JSON for imposter at given id if both replayable and removeProxies querystrings are false', function () {
            const response = FakeResponse.create(),
                first = { port: 1, toJSON: mock().returns(Q('firstJSON')) },
                second = { port: 2, toJSON: mock().returns(Q('secondJSON')) },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => controller.get({ url: '/imposters/2?replayable=false&removeProxies=false', params: { id: 2 } }, response))
                .then(() => {
                    assert.strictEqual(response.body, 'secondJSON');
                    assert.ok(second.toJSON.wasCalledWith({ replayable: false, removeProxies: false }), second.toJSON.message());
                });
        });
    });

    describe('#del', function () {
        promiseIt('should stop the imposter', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Q(true)),
                    toJSON: mock().returns(Q('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(imposter))
                .then(() => controller.del({ url: '/imposters/1', params: { id: 1 } }, response))
                .then(() => {
                    assert(imposter.stop.wasCalled());
                });
        });

        promiseIt('should remove the imposter from the list', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Q(true)),
                    toJSON: mock().returns(Q('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(imposter))
                .then(() => controller.del({ url: '/imposters/1', params: { id: 1 } }, response))
                .then(() => repo.all())
                .then(all => {
                    assert.deepEqual(all, []);
                });
        });

        promiseIt('should send request even if no imposter exists', function () {
            const response = FakeResponse.create(),
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return controller.del({ url: '/imposters/1', params: { id: 1 } }, response).then(() => {
                assert.deepEqual(response.body, {});
            });
        });

        promiseIt('should return replayable JSON for imposter at given id if replayable querystring set', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Q(true)),
                    toJSON: mock().returns(Q('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(imposter))
                .then(() => controller.del({ url: '/imposters/1?replayable=true', params: { id: 1 } }, response))
                .then(() => {
                    assert.ok(imposter.toJSON.wasCalledWith({ replayable: true, removeProxies: false }), imposter.toJSON.message());
                });
        });

        promiseIt('should return removeProxies JSON for imposter at given id if removeProxies querystring set', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Q(true)),
                    toJSON: mock().returns(Q('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(imposter))
                .then(() => controller.del({ url: '/imposters/1?removeProxies=true', params: { id: 1 } }, response))
                .then(() => {
                    assert.ok(imposter.toJSON.wasCalledWith({ replayable: false, removeProxies: true }), imposter.toJSON.message());
                });
        });

        promiseIt('should return replayable and removeProxies JSON for imposter at given id if both querystring values set', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Q(true)),
                    toJSON: mock().returns(Q('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(imposter))
                .then(() => controller.del({ url: '/imposters/1?removeProxies=true&replayable=true', params: { id: 1 } }, response))
                .then(() => {
                    assert.ok(imposter.toJSON.wasCalledWith({ replayable: true, removeProxies: true }), imposter.toJSON.message());
                });
        });

        promiseIt('should send default JSON for the deleted the imposter if both replayable and removeProxies querystrings are missing', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    stop: mock().returns(Q(true)),
                    toJSON: mock().returns(Q('JSON'))
                },
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo);

            return repo.add(imposterize(imposter))
                .then(() => controller.del({ url: '/imposters/1', params: { id: 1 } }, response))
                .then(() => {
                    assert.ok(imposter.toJSON.wasCalledWith({ replayable: false, removeProxies: false }), imposter.toJSON.message());
                });
        });
    });

    describe('#putStubs', function () {
        promiseIt('should return a 400 if no stubs element', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    toJSON: mock().returns(Q({})),
                    overwriteStubs: mock()
                },
                logger = require('../fakes/fakeLogger').create(),
                repo = ImpostersRepo.create(),
                controller = Controller.create({}, repo, logger, false);

            return repo.add(imposterize(imposter))
                .then(() => controller.putStubs({ params: { id: 1 }, body: {} }, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors.length, 1);
                    assert.strictEqual(response.body.errors[0].code, 'bad data');
                });
        });

        promiseIt('should return a 400 if no stubs is not an array', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    toJSON: mock().returns(Q({})),
                    overwriteStubs: mock()
                },
                repo = ImpostersRepo.create(),
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({}, repo, logger, false),
                request = {
                    params: { id: 1 },
                    body: { stubs: 1 }
                };

            return repo.add(imposterize(imposter))
                .then(() => controller.putStubs(request, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors.length, 1);
                    assert.strictEqual(response.body.errors[0].code, 'bad data');
                });
        });

        promiseIt('should return a 400 if no stub fails dry run validation', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    creationRequest: { port: 1, protocol: 'test', stubs: [{}] },
                    toJSON: mock().returns(Q({ port: 1, protocol: 'test', stubs: [{}] }))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1 },
                    body: { stubs: [{ responses: [{ invalid: 1 }] }] }
                };

            return repo.add(imposterize(imposter))
                .then(() => controller.putStubs(request, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors.length, 1);
                    assert.strictEqual(response.body.errors[0].code, 'bad data');
                });
        });

        promiseIt('should return a 400 if trying to add injection without --allowInjection set', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    toJSON: mock().returns(Q({ protocol: 'test' }))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1 },
                    body: { stubs: [{ responses: [{ inject: '() => {}' }] }] }
                };

            return repo.add(imposterize(imposter))
                .then(() => controller.putStubs(request, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors.length, 1);
                    assert.strictEqual(response.body.errors[0].code, 'invalid injection');
                });
        });
    });

    describe('#putStub', function () {
        promiseIt('should return a 404 if stubIndex is not an integer', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    stubsJSON: mock().returns(Q([]))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1, stubIndex: 'test' },
                    body: { stubs: [{ responses: [{ is: 'response' }] }] }
                };

            return repo.add(imposterize(imposter))
                .then(() => controller.putStub(request, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 404);
                    assert.strictEqual(response.body.errors.length, 1);
                    assert.deepEqual(response.body.errors[0], {
                        code: 'bad data',
                        message: "'stubIndex' must be a valid integer, representing the array index position of the stub to replace"
                    });
                });
        });

        promiseIt('should return a 404 if stubIndex is less than 0', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    stubsJSON: mock().returns(Q([]))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1, stubIndex: -1 },
                    body: { stubs: [{ responses: [{ is: 'response' }] }] }
                };

            return repo.add(imposterize(imposter))
                .then(() => controller.putStub(request, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 404);
                    assert.strictEqual(response.body.errors.length, 1);
                    assert.deepEqual(response.body.errors[0], {
                        code: 'bad data',
                        message: "'stubIndex' must be a valid integer, representing the array index position of the stub to replace"
                    });
                });
        });

        promiseIt('should return a 404 if stubIndex is greater then highest index of stubs array', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    stubsJSON: mock().returns(Q([0, 1, 2]))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1, stubIndex: 3 },
                    body: { stubs: [{ responses: [{ is: 'response' }] }] }
                };

            return repo.add(imposterize(imposter))
                .then(() => controller.putStub(request, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 404);
                    assert.strictEqual(response.body.errors.length, 1);
                    assert.deepEqual(response.body.errors[0], {
                        code: 'bad data',
                        message: "'stubIndex' must be a valid integer, representing the array index position of the stub to replace"
                    });
                });
        });

        promiseIt('should return a 400 if no stub fails dry run validation', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    toJSON: mock().returns(Q({ protocol: 'test' })),
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

            return repo.add(imposter)
                .then(() => controller.putStub(request, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors.length, 1);
                    assert.deepEqual(response.body.errors[0], {
                        code: 'bad data',
                        message: 'unrecognized response type',
                        source: { INVALID: 'response' }
                    });
                });
        });

        promiseIt('should return a 400 if no adding inject without --allowInjection', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    toJSON: mock().returns(Q({ protocol: 'test' })),
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

            return repo.add(imposter)
                .then(() => controller.putStub(request, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body.errors.length, 1);
                    assert.deepEqual(response.body.errors[0], {
                        code: 'invalid injection',
                        message: 'JavaScript injection is not allowed unless mb is run with the --allowInjection flag',
                        source: { responses: [{ inject: '() => {}' }] }
                    });
                });
        });
    });

    describe('#deleteStub', function () {
        promiseIt('should return a 404 if stubIndex is greater then highest index of stubs array', function () {
            const response = FakeResponse.create(),
                imposter = {
                    port: 1,
                    protocol: 'test',
                    stubsJSON: mock().returns(Q([0, 1, 2]))
                },
                repo = ImpostersRepo.create(),
                Protocol = { testRequest: {} },
                logger = require('../fakes/fakeLogger').create(),
                controller = Controller.create({ test: Protocol }, repo, logger, false),
                request = {
                    params: { id: 1, stubIndex: 3 },
                    body: { stubs: [{ responses: [{ is: 'response' }] }] }
                };

            return repo.add(imposterize(imposter))
                .then(() => controller.deleteStub(request, response))
                .then(() => {
                    assert.strictEqual(response.statusCode, 404);
                    assert.strictEqual(response.body.errors.length, 1);
                    assert.deepEqual(response.body.errors[0], {
                        code: 'bad data',
                        message: "'stubIndex' must be a valid integer, representing the array index position of the stub to replace"
                    });
                });
        });
    });
});
