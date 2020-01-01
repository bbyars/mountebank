'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/filesystemBackedImpostersRepository'),
    fs = require('fs-extra'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    Q = require('q');

describe('filesystemBackedImpostersRepository', function () {
    afterEach(function () {
        fs.removeSync('.mbtest');
    });

    function read (filename) {
        // Don't use require because it caches on the first read of that filename
        return JSON.parse(fs.readFileSync(filename));
    }

    function write (filename, obj) {
        const path = require('path'),
            dir = path.dirname(filename);

        fs.ensureDirSync(dir);
        fs.writeFileSync(filename, JSON.stringify(obj, null, 2));
    }

    describe('#add', function () {
        promiseIt('should create a header file for imposter', function () {
            const repo = Repo.create({ datadir: '.mbtest' });

            return repo.add({ port: 1000, protocol: 'test', customField: true, stubs: [], requests: [] }).then(() => {
                const saved = read('.mbtest/1000/imposter.json');
                assert.deepEqual(saved, { port: 1000, protocol: 'test', customField: true, stubs: [] });
            });
        });

        promiseIt('should not add stubs for the imposter (stubsFor.add does that)', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                imposter = {
                    port: 1000,
                    protocol: 'test',
                    stubs: [{
                        responses: [{ is: { field: 'value' } }]
                    }]
                };

            return repo.add(imposter).then(() => {
                const saved = read('.mbtest/1000/imposter.json');
                assert.deepEqual(saved, { port: 1000, protocol: 'test', stubs: [] });
            });
        });

        promiseIt('should not change stubs previously added by stubsFor.add', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                stubs = repo.stubsFor(1000),
                imposter = {
                    port: 1000,
                    protocol: 'test',
                    stubs: [{
                        responses: [{ is: { field: 'value' } }]
                    }]
                };

            return stubs.add(imposter.stubs[0])
                .then(() => repo.add(imposter))
                .then(() => {
                    const saved = read('.mbtest/1000/imposter.json');
                    assert.strictEqual(saved.stubs.length, 1);
                    assert.strictEqual(saved.port, 1000);
                    assert.strictEqual(saved.protocol, 'test');
                });
        });
    });

    describe('#all', function () {
        promiseIt('should not retrieve imposters in database that have not been added', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                first = { port: 1000, protocol: 'test' },
                second = { port: 2000, protocol: 'test' };

            // Simulate another process adding the imposter
            write('.mbtest/2000/imposter.json', second);

            return repo.add(first)
                .then(() => repo.all())
                .then(all => {
                    assert.deepEqual(all, [{ port: 1000, protocol: 'test', stubs: [] }]);
                });
        });
    });

    describe('#del', function () {
        promiseIt('should return imposter and delete all files', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                imposter = {
                    port: 1000,
                    protocol: 'test',
                    stubs: [{
                        predicates: [],
                        responses: [{ is: { key: 'value' } }]
                    }]
                };

            return repo.stubsFor(1000).add(imposter.stubs[0])
                .then(() => repo.add(imposter))
                .then(() => repo.del(1000))
                .then(deleted => {
                    assert.strictEqual(fs.existsSync('.mbtest/1000'), false);
                    assert.deepEqual(deleted, imposter);
                });
        });

        promiseIt('should call stop() even if another process has deleted the directory', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                imposter = { port: 1000, protocol: 'test', stop: mock().returns(Q()) };

            return repo.add(imposter)
                .then(() => {
                    fs.removeSync('.mbtest/1000');
                    return repo.del(1000);
                }).then(() => {
                    assert.ok(imposter.stop.wasCalled());
                });
        });
    });

    describe('#deleteAll', function () {
        promiseIt('does nothing if no database', function () {
            const repo = Repo.create({ datadir: '.mbtest' });

            return repo.deleteAll().then(() => {
                assert.strictEqual(fs.existsSync('.mbtest'), false);
            });
        });

        promiseIt('removes all added imposters from the filesystem', function () {
            const repo = Repo.create({ datadir: '.mbtest' });

            return repo.add({ port: 1000, protocol: 'test' })
                .then(() => repo.add({ port: 2000, protocol: 'test' }))
                .then(() => repo.deleteAll())
                .then(() => {
                    assert.strictEqual(fs.existsSync('.mbtest'), false);
                });
        });

        promiseIt('calls stop() on all added imposters even if another process already deleted the database', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                first = { port: 1000, protocol: 'test', stop: mock().returns(Q()) },
                second = { port: 2000, protocol: 'test', stop: mock().returns(Q()) };

            return repo.add(first)
                .then(() => repo.add(second))
                .then(() => {
                    fs.removeSync('.mbtest');
                    return repo.deleteAll();
                }).then(() => {
                    assert.ok(first.stop.wasCalled());
                    assert.ok(second.stop.wasCalled());
                });
        });
    });

    describe('#deleteAllSync', function () {
        promiseIt('synchronously removes database', function () {
            const repo = Repo.create({ datadir: '.mbtest' });

            return repo.add({ port: 1000, protocol: 'test' })
                .then(() => repo.add({ port: 2000, protocol: 'test' }))
                .then(() => {
                    repo.deleteAllSync();
                    assert.strictEqual(fs.existsSync('.mbtest'), false);
                });
        });

        promiseIt('calls stop() on all added imposters even if another process already deleted the database', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                first = { port: 1000, protocol: 'test', stop: mock().returns(Q()) },
                second = { port: 2000, protocol: 'test', stop: mock().returns(Q()) };

            return repo.add(first)
                .then(() => repo.add(second))
                .then(() => {
                    fs.removeSync('.mbtest');
                    repo.deleteAllSync();
                    assert.ok(first.stop.wasCalled());
                    assert.ok(second.stop.wasCalled());
                });
        });
    });
});
