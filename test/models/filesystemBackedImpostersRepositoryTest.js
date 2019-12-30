'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/filesystemBackedImpostersRepository'),
    fs = require('fs-extra'),
    promiseIt = require('../testHelpers').promiseIt;

describe('filesystemBackedImpostersRepository', function () {
    afterEach(function () {
        fs.removeSync('.mbtest');
    });

    function read (filename) {
        // Don't use require because it caches on the first read of that filename
        return JSON.parse(fs.readFileSync(filename));
    }

    describe('#add', function () {
        promiseIt('should create a header file for imposter', function () {
            const repo = Repo.create({ datadir: '.mbtest' });

            return repo.add({ port: 1000, protocol: 'test', customField: true, stubs: [], requests: [] }).then(() => {
                const saved = read('.mbtest/1000/imposter.json');
                assert.deepEqual(saved, { port: 1000, protocol: 'test', customField: true, stubs: [] });
            });
        });
    });

    describe('#del', function () {
        promiseIt('should return imposter and delete all files', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                imposter = { port: 1000, protocol: 'test' };

            return repo.add(imposter)
                .then(() => repo.del(1000))
                .then(() => {
                    assert.strictEqual(fs.existsSync('.mbtest/1000'), false);
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

        promiseIt('removes all added imposters', function () {
            const repo = Repo.create({ datadir: '.mbtest' });

            return repo.add({ port: 1000, protocol: 'test' })
                .then(() => repo.add({ port: 2000, protocol: 'test' }))
                .then(() => repo.deleteAll())
                .then(() => {
                    assert.strictEqual(fs.existsSync('.mbtest'), false);
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
    });
});
