'use strict';

var assert = require('assert'),
    mock = require('../mock').mock,
    Controller = require('../../src/controllers/impostersController'),
    FakeResponse = require('../fakes/fakeResponse'),
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt;

describe('ImpostersController', function () {
    var response;

    beforeEach(function () {
        response = FakeResponse.create();
    });

    describe('#get', function () {
        it('should send an empty array if no imposters', function () {
            var controller = Controller.create({}, {});

            controller.get({ url: '/imposters' }, response);

            assert.deepEqual(response.body, {imposters: []});
        });

        it('should send list JSON for all imposters', function () {
            var firstImposter = { toListJSON: mock().returns('firstJSON') },
                secondImposter = { toListJSON: mock().returns('secondJSON') },
                controller = Controller.create({}, { 1: firstImposter, 2: secondImposter });

            controller.get({ url: '/imposters' }, response);

            assert.deepEqual(response.body, {imposters: ['firstJSON', 'secondJSON']});
        });

        it('should send replayable JSON for all imposters if querystring present', function () {
            var firstImposter = { toReplayableJSON: mock().returns('firstJSON') },
                secondImposter = { toReplayableJSON: mock().returns('secondJSON') },
                controller = Controller.create({}, { 1: firstImposter, 2: secondImposter });

            controller.get({ url: '/imposters?replayable=true' }, response);

            assert.deepEqual(response.body, {imposters: ['firstJSON', 'secondJSON']});
        });
    });

    describe('#post', function () {
        var request, Imposter, imposter, imposters, Protocol, controller, logger;

        beforeEach(function () {
            request = { body: {}, socket: { remoteAddress: 'host', remotePort: 'port' } };
            imposter = {
                url: mock().returns('imposter-url'),
                toJSON: mock().returns('JSON')
            };
            Imposter = {
                create: mock().returns(Q(imposter))
            };
            imposters = {};
            Protocol = { name: 'http' };
            logger = { debug: mock(), warn: mock() };
            controller = Controller.create({ 'http': Protocol }, imposters, Imposter, logger);
        });

        promiseIt('should return a 201 with the Location header set', function () {
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert(response.headers.Location, 'http://localhost/servers/3535');
                assert.strictEqual(response.statusCode, 201);
            });
        });

        promiseIt('should return imposter JSON', function () {
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.body, 'JSON');
            });
        });

        promiseIt('should add new imposter to list of all imposters', function () {
            imposter.port = 3535;
            request.body = { protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.deepEqual(imposters, { 3535: imposter });
            });
        });

        promiseIt('should return a 400 for a floating point port', function () {
            request.body = { protocol: 'http', port: '123.45' };

            return controller.post(request, response).then(function () {
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

            return controller.post(request, response).then(function () {
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

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.strictEqual(response.body.errors.length, 1);
                assert.strictEqual(response.body.errors[0].code, 'bad data');
            });
        });

        promiseIt('should aggregate multiple errors', function () {
            request.body = { port: -1, protocol: 'invalid' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.body.errors.length, 2, response.body.errors);
            });
        });

        promiseIt('should return a 403 for insufficient access', function () {
            Imposter.create = mock().returns(Q.reject({
                code: 'insufficient access',
                key: 'value'
            }));
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
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
            Imposter.create = mock().returns(Q.reject('ERROR'));
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, { errors: ['ERROR'] });
            });
        });

        promiseIt('should not call protocol validation if there are common validation failures', function () {
            Protocol.Validator = { create: mock() };
            request.body = { protocol: 'invalid' };

            return controller.post(request, response).then(function () {
                assert.ok(!Protocol.Validator.create.wasCalled());
            });
        });

        promiseIt('should validate with Protocol if there are no common validation failures', function () {
            Protocol.Validator = {
                create: mock().returns({
                    validate: mock().returns(Q({ isValid: false, errors: 'ERRORS' }))
                })
            };
            request.body = { port: 3535, protocol: 'http' };

            return controller.post(request, response).then(function () {
                assert.strictEqual(response.statusCode, 400);
                assert.deepEqual(response.body, { errors: 'ERRORS' });
            });
        });
    });

    describe('#del', function () {
        it('should delete all imposters', function () {
            var firstImposter = { stop: mock(), toReplayableJSON: mock().returns({ 1: true }) },
                secondImposter = { stop: mock(), toReplayableJSON: mock().returns({ 2: true }) },
                imposters = { 1: firstImposter, 2: secondImposter },
                controller = Controller.create({}, imposters, {}, {});

            controller.del({}, response);

            assert.deepEqual(imposters, {});
        });

        it('should call stop on all imposters', function () {
            var firstImposter = { stop: mock(), toReplayableJSON: mock().returns({ 1: true }) },
                secondImposter = { stop: mock(), toReplayableJSON: mock().returns({ 2: true }) },
                imposters = { 1: firstImposter, 2: secondImposter },
                controller = Controller.create({}, imposters, {}, {});

            controller.del({}, response);

            assert(firstImposter.stop.wasCalled());
            assert(secondImposter.stop.wasCalled());
        });

        it('should return replayable JSON', function () {
            var firstImposter = { stop: mock(), toReplayableJSON: mock().returns({ 1: true }) },
                secondImposter = { stop: mock(), toReplayableJSON: mock().returns({ 2: true }) },
                imposters = { 1: firstImposter, 2: secondImposter },
                controller = Controller.create({}, imposters, {}, {});

            controller.del({}, response);

            assert.deepEqual(response.body, { imposters: [ { 1: true }, { 2: true } ] });
        });
    });

    describe('#put', function () {
        var request, logger;

        beforeEach(function () {
            request = { body: {}, socket: { remoteAddress: 'host', remotePort: 'port' } };
            logger = { debug: mock(), warn: mock() };
        });

        promiseIt('should return an empty array if no imposters provided', function () {
            var controller = Controller.create({}, {}, {}, logger);
            request.body = { imposters: [] };

            return controller.put(request, response).then(function () {
                assert.deepEqual(response.body, { imposters: [] });
            });
        });

        promiseIt('should return imposter list JSON for all imposters', function () {
            var Protocol = { name: 'http' },
                firstImposter = { toListJSON: mock().returns({ first: true }) },
                secondImposter = { toListJSON: mock().returns({ second: true }) },
                imposters = [firstImposter, secondImposter],
                creates = 0,
                Imposter = {
                    create: function () {
                        var result = imposters[creates];
                        creates += 1;
                        return result;
                    }
                },
                controller = Controller.create({ 'http': Protocol }, {}, Imposter, logger);

            request.body = { imposters: [{ protocol: 'http' }, { protocol: 'http' }]};

            return controller.put(request, response).then(function () {
                assert.deepEqual(response.body, { imposters: [ { first: true }, { second: true }]});
            });
        });

        promiseIt('should replace imposters list', function () {
            var Protocol = { name: 'http' },
                oldImposter = { stop: mock() },
                imposters = { 0: oldImposter },
                firstImposter = { toListJSON: mock().returns({ first: true }), port: 1 },
                secondImposter = { toListJSON: mock().returns({ second: true }), port: 2 },
                impostersToCreate = [firstImposter, secondImposter],
                creates = 0,
                Imposter = {
                    create: function () {
                        var result = impostersToCreate[creates];
                        creates += 1;
                        return result;
                    }
                },
                controller = Controller.create({ 'http': Protocol }, imposters, Imposter, logger);

            request.body = { imposters: [{ protocol: 'http' }, { protocol: 'http' }]};

            return controller.put(request, response).then(function () {
                assert.deepEqual(imposters, { 1: firstImposter, 2: secondImposter });
            });
        });

        promiseIt('should return a 400 for any invalid imposter', function () {
            var Protocol = { name: 'http' },
                controller = Controller.create({ 'http': Protocol }, {}, {}, logger);

            request.body = { imposters: [{ protocol: 'http' }, {}]};

            return controller.put(request, response).then(function () {
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
            var Protocol = { name: 'http' },
                creates = 0,
                Imposter = {
                    create: function () {
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
                    }
                },
                controller = Controller.create({ 'http': Protocol }, {}, Imposter, logger);

            request.body = { imposters: [{ protocol: 'http' }, { protocol: 'http' }]};

            return controller.put(request, response).then(function () {
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
