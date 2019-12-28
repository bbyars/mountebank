'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/filesystemBackedImpostersRepository'),
    fs = require('fs-extra'),
    cwd = require('process').cwd(),
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
                const saved = require(`${cwd}/.mbtest/1000`);
                assert.deepEqual(saved, { port: 1000, protocol: 'test', customField: true });
            });
        });

        promiseIt('should save stub predicates in batch and responses individually', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                imposter = {
                    port: 1000,
                    protocol: 'test',
                    stubs: [{
                        predicates: [
                            { equals: { key: 'value' } },
                            { exists: { first: true } }
                        ],
                        responses: [
                            { is: { field: 'one' } },
                            { is: { field: 'two' } }
                        ]
                    }]
                };

            return repo.add(imposter).then(() => {
                const stubs = read('.mbtest/1000/stubs/0-99.json');
                assert.deepEqual(stubs, [{
                    predicates: [
                        { equals: { key: 'value' } },
                        { exists: { first: true } }
                    ],
                    responseDir: '1000/stubs/0'
                }]);

                const responseIndex = read('.mbtest/1000/stubs/0/index.json');
                assert.deepEqual(responseIndex, {
                    next: 0,
                    order: [0, 1]
                });

                const firstResponse = read('.mbtest/1000/stubs/0/0.json');
                assert.deepEqual(firstResponse, { is: { field: 'one' } });
                const secondResponse = read('.mbtest/1000/stubs/0/1.json');
                assert.deepEqual(secondResponse, { is: { field: 'two' } });
            });
        });
    });

    describe('#get', function () {
        it('should return null if no imposter exists', function () {
            const repo = Repo.create({ datadir: '.mbtest' });
            return repo.get(1000).then(imposter => {
                assert.strictEqual(imposter, null);
            });
        });

        it('should retrieve previously added imposter', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                imposter = {
                    port: 1000,
                    protocol: 'test',
                    stubs: [{
                        predicates: [
                            { equals: { key: 'value' } },
                            { exists: { first: true } }
                        ],
                        responses: [
                            { is: { field: 'one' } },
                            { is: { field: 'two' } }
                        ]
                    }]
                };

            return repo.add(imposter)
                .then(() => repo.get(1000))
                .then(saved => {
                    assert.deepEqual(saved, imposter);
                });
        });

        it('should retrieve imposter with empty stubs array if no stubs saved', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                imposter = { port: 1000, protocol: 'test', customField: true };

            return repo.add(imposter)
                .then(() => repo.get(1000))
                .then(saved => {
                    assert.deepEqual(saved, {
                        port: 1000,
                        protocol: 'test',
                        customField: true,
                        stubs: []
                    });
                });
        });

        it('should retrieve imposter with empty responses array if no responses saved', function () {
            // Validation should prevent this from happening unless they've mucked with the database directly
            const repo = Repo.create({ datadir: '.mbtest' }),
                imposter = {
                    port: 1000,
                    protocol: 'test',
                    stubs: [{
                        predicates: [{ equals: { key: 'value' } }]
                    }]
                };

            return repo.add(imposter)
                .then(() => repo.get(1000))
                .then(saved => {
                    assert.deepEqual(saved, {
                        port: 1000,
                        protocol: 'test',
                        stubs: [{
                            predicates: [{ equals: { key: 'value' } }],
                            responses: []
                        }]
                    });
                });
        });
    });

    describe('#getAll', function () {
        promiseIt('should retrieve empty object if nothing saved', function () {
            const repo = Repo.create({ datadir: '.mbtest' });
            return repo.getAll().then(imposters => {
                assert.deepEqual(imposters, {});
            });
        });

        promiseIt('should retrieve all saved keyed by port', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                firstImposter = {
                    port: 1000,
                    protocol: 'test',
                    stubs: [{
                        predicates: [{ equals: { key: 'value' } }],
                        responses: [{ is: { field: 'one' } }]
                    }]
                },
                secondImposter = { port: 2000, protocol: 'test', customField: true };

            return repo.add(firstImposter)
                .then(() => repo.add(secondImposter))
                .then(() => repo.getAll())
                .then(imposters => {
                    assert.deepEqual(imposters, {
                        1000: firstImposter,
                        2000: {
                            port: 2000,
                            protocol: 'test',
                            customField: true,
                            stubs: []
                        }
                    });
                });
        });
    });

    describe('#exists', function () {
        promiseIt('should return false if imposter has not previously been added', function () {
            const repo = Repo.create({ datadir: '.mbtest' });

            return repo.exists(1000).then(result => {
                assert.strictEqual(result, false);
            });
        });

        promiseIt('should return true if imposter has been added', function () {
            const repo = Repo.create({ datadir: '.mbtest' });

            return repo.add({ port: 1000, protocol: 'test' }).then(() =>
                repo.exists(1000)
            ).then(result => {
                assert.strictEqual(result, true);
            });
        });
    });

    describe('#del', function () {
        promiseIt('should return null if imposter has not previously been added', function () {
            const repo = Repo.create({ datadir: '.mbtest' });

            return repo.del(1000).then(imposter => {
                assert.strictEqual(imposter, null);
            });
        });

        promiseIt('should return imposter and delete all files', function () {
            const repo = Repo.create({ datadir: '.mbtest' }),
                imposter = {
                    port: 1000,
                    protocol: 'test',
                    stubs: [{
                        predicates: [
                            { equals: { key: 'value' } },
                            { exists: { first: true } }
                        ],
                        responses: [
                            { is: { field: 'one' } },
                            { is: { field: 'two' } }
                        ]
                    }]
                };

            return repo.add(imposter).then(() =>
                repo.del(1000)
            ).then(deleted => {
                assert.deepEqual(deleted, imposter);
                assert.strictEqual(fs.existsSync('.mbtest/1000.json'), false);
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
