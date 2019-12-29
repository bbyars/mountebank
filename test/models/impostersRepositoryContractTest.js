'use strict';

/**
 * Tests the semantics of each repository implementation to ensure they function equivalently
 */

const assert = require('assert'),
    promiseIt = require('../testHelpers').promiseIt,
    fs = require('fs-extra'),
    types = [
        {
            name: 'inMemoryImpostersRepository',
            create: require('../../src/models/inMemoryImpostersRepository').create,
            beforeEach: () => {},
            afterEach: () => {}
        },
        {
            name: 'filesystemBackedImpostersRepository',
            create: () => require('../../src/models/filesystemBackedImpostersRepository').create({ datadir: '.mbtest' }),
            beforeEach: () => {},
            afterEach: () => { fs.removeSync('.mbtest'); }
        }
    ],
    mock = require('../mock').mock,
    Q = require('q');

function stripFunctions (obj) {
    return JSON.parse(JSON.stringify(obj));
}

types.forEach(function (type) {
    describe(type.name, function () {
        let repo;

        beforeEach(function () {
            type.beforeEach();
            repo = type.create();
        });

        afterEach(type.afterEach);

        describe('#add', function () {
            promiseIt('should allow a reciprocal get', function () {
                return repo.add({ port: 1, value: 2 })
                    .then(() => repo.get(1))
                    .then(imposter => {
                        assert.deepEqual(imposter, { port: 1, value: 2, stubs: [] });
                    });
            });
        });

        describe('#get', function () {
            promiseIt('should return null if no imposter exists', function () {
                return repo.get(1).then(imposter => {
                    assert.strictEqual(imposter, null);
                });
            });
        });

        describe('#all', function () {
            promiseIt('should return an empty list if nothing added', function () {
                return repo.all().then(imposters => {
                    assert.deepEqual(imposters, []);
                });
            });

            promiseIt('should return all previously added keyed by port', function () {
                return repo.add({ port: 1, value: 2 })
                    .then(() => repo.add({ port: 2, value: 3 }))
                    .then(repo.all)
                    .then(imposters => {
                        assert.deepEqual(imposters, {
                            1: { port: 1, value: 2, stubs: [] },
                            2: { port: 2, value: 3, stubs: [] }
                        });
                    });
            });
        });

        describe('#exists', function () {
            promiseIt('should return false if given port has not been added', function () {
                return repo.add({ port: 1, value: 2 })
                    .then(() => repo.exists(2))
                    .then(exists => {
                        assert.strictEqual(exists, false);
                    });
            });

            promiseIt('should return true if given port has been added', function () {
                return repo.add({ port: 1, value: 2 })
                    .then(() => repo.exists(1))
                    .then(exists => {
                        assert.strictEqual(exists, true);
                    });
            });
        });

        describe('#del', function () {
            promiseIt('should return null if imposter never added', function () {
                return repo.del(1).then(imposter => {
                    assert.strictEqual(imposter, null);
                });
            });

            promiseIt('should return imposter and remove from list', function () {
                return repo.add({ port: 1, value: 2, stop: mock().returns(Q()) })
                    .then(() => repo.del(1))
                    .then(imposter => {
                        assert.deepEqual(stripFunctions(imposter), { port: 1, value: 2, stubs: [] });
                        return repo.get(1);
                    }).then(imposter => {
                        assert.strictEqual(imposter, null);
                    });
            });

            promiseIt('should call stop() on the imposter', function () {
                const imposter = { port: 1, value: 2, stop: mock().returns(Q()) };
                return repo.add(imposter)
                    .then(() => repo.del(1))
                    .then(() => {
                        assert.ok(imposter.stop.wasCalled(), imposter.stop.message());
                    });
            });
        });

        describe('#deleteAllSync', function () {
            promiseIt('should call stop() on all imposters and empty list', function () {
                const first = { port: 1, value: 2, stop: mock().returns(Q()) },
                    second = { port: 2, value: 3, stop: mock().returns(Q()) };
                return repo.add(first)
                    .then(() => repo.add(second))
                    .then(() => {
                        repo.deleteAllSync();
                        assert.ok(first.stop.wasCalled(), first.stop.message());
                        assert.ok(second.stop.wasCalled(), second.stop.message());
                        return repo.all();
                    }).then(imposters => {
                        assert.deepEqual(imposters, []);
                    });
            });
        });

        describe('#deleteAll', function () {
            promiseIt('should call stop() on all imposters and empty list', function () {
                const first = { port: 1, value: 2, stop: mock().returns(Q()) },
                    second = { port: 2, value: 3, stop: mock().returns(Q()) };
                return repo.add(first)
                    .then(() => repo.add(second))
                    .then(repo.deleteAll)
                    .then(() => {
                        assert.ok(first.stop.wasCalled(), first.stop.message());
                        assert.ok(second.stop.wasCalled(), second.stop.message());
                        return repo.all();
                    }).then(imposters => {
                        assert.deepEqual(imposters, []);
                    });
            });
        });
    });
});
