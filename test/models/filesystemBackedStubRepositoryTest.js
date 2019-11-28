'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/filesystemBackedStubRepository'),
    fs = require('fs-extra'),
    promiseIt = require('../testHelpers').promiseIt,
    imposterDir = '.mbtest/3000';

describe('filesystemBackedStubRepository', function () {
    beforeEach(function () {
        fs.ensureDirSync(imposterDir);
    });

    afterEach(function () {
        fs.removeSync('.mbtest');
    });

    function read (filename) {
        // Don't use require because it caches on the first read of that filename
        return JSON.parse(fs.readFileSync(`${imposterDir}/${filename}`));
    }

    function write (filename, obj) {
        return fs.writeFileSync(`${imposterDir}/${filename}`, JSON.stringify(obj));
    }

    describe('#add', function () {
        promiseIt('should create stub files if first stub to be added', function () {
            const repo = Repo.create({ imposterDir }),
                stub = {
                    predicates: [{ equals: { field: 'request' } }],
                    responses: [{ is: { field: 'response' } }]
                };
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add(stub).then(() => {
                assert.deepEqual(read('imposter.json'), {
                    port: 3000,
                    protocol: 'test',
                    stubs: [{
                        predicates: [{ equals: { field: 'request' } }],
                        meta: {
                            responseFiles: ['stubs/0/responses/0.json'],
                            orderWithRepeats: [0],
                            nextIndex: 0
                        }
                    }]
                });

                assert.deepEqual(read('stubs/0/responses/0.json'), { is: { field: 'response' } });
            });
        });

        promiseIt('should add to stubs file if it already exists', function () {
            const repo = Repo.create({ imposterDir }),
                firstStub = {
                    predicates: [{ equals: { field: 'first-request' } }],
                    responses: [{ is: { field: 'first-response' } }]
                },
                secondStub = {
                    predicates: [{ equals: { field: 'second-request' } }],
                    responses: [{ is: { field: 'second-response' } }]
                };
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add(firstStub)
                .then(() => repo.add(secondStub))
                .then(() => {
                    assert.deepEqual(read('imposter.json'), {
                        port: 3000,
                        protocol: 'test',
                        stubs: [
                            {
                                predicates: [{ equals: { field: 'first-request' } }],
                                meta: {
                                    responseFiles: ['stubs/0/responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            },
                            {
                                predicates: [{ equals: { field: 'second-request' } }],
                                meta: {
                                    responseFiles: ['stubs/1/responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            }
                        ]
                    });

                    assert.deepEqual(read('stubs/0/responses/0.json'),
                        { is: { field: 'first-response' } });
                    assert.deepEqual(read('stubs/1/responses/0.json'),
                        { is: { field: 'second-response' } });
                });
        });

        promiseIt('should save multiple responses in separate files', function () {
            const repo = Repo.create({ imposterDir }),
                stub = {
                    predicates: [{ equals: { field: 'request' } }],
                    responses: [
                        { is: { field: 'first-response' } },
                        { is: { field: 'second-response' } }
                    ]
                };
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add(stub).then(() => {
                assert.deepEqual(read('imposter.json'), {
                    port: 3000,
                    protocol: 'test',
                    stubs: [{
                        predicates: [{ equals: { field: 'request' } }],
                        meta: {
                            responseFiles: ['stubs/0/responses/0.json', 'stubs/0/responses/1.json'],
                            orderWithRepeats: [0, 1],
                            nextIndex: 0
                        }
                    }]
                });

                assert.deepEqual(read('stubs/0/responses/0.json'), { is: { field: 'first-response' } });
                assert.deepEqual(read('stubs/0/responses/1.json'), { is: { field: 'second-response' } });
            });
        });

        promiseIt('should apply repeat behavior', function () {
            const repo = Repo.create({ imposterDir }),
                stub = {
                    predicates: [{ equals: { field: 'request' } }],
                    responses: [
                        { is: { field: 'first-response' }, _behaviors: { repeat: 2 } },
                        { is: { field: 'second-response' } },
                        { is: { field: 'third-response' }, _behaviors: { repeat: 3 } }
                    ]
                };
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add(stub).then(() => {
                assert.deepEqual(read('imposter.json'), {
                    port: 3000,
                    protocol: 'test',
                    stubs: [{
                        predicates: [{ equals: { field: 'request' } }],
                        meta: {
                            responseFiles: ['stubs/0/responses/0.json', 'stubs/0/responses/1.json', 'stubs/0/responses/2.json'],
                            orderWithRepeats: [0, 0, 1, 2, 2, 2],
                            nextIndex: 0
                        }
                    }]
                });
            });
        });

        promiseIt('should throw error if no imposter file', function () {
            const repo = Repo.create({ imposterDir });

            return repo.add({}).then(() => {
                assert.fail('should have rejected');
            }, err => {
                assert.deepEqual(err, {
                    code: 'corrupted database',
                    message: `no imposter file: ${imposterDir}/imposter.json`
                });
            });
        });
    });

    describe('#first', function () {
        promiseIt('should return undefined if no match', function () {
            const repo = Repo.create({ imposterDir });
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.first(stub => stub.predicates.length === 1).then(match => {
                assert.strictEqual('undefined', typeof match);
            });
        });

        promiseIt('should return first match', function () {
            const repo = Repo.create({ imposterDir });
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add({ predicates: ['first', 'second'] })
                .then(() => repo.add({ predicates: ['third'] }))
                .then(() => repo.add({ predicates: ['fourth'] }))
                .then(() => repo.first(stub => stub.predicates.length === 1))
                .then(match => {
                    assert.deepEqual(match, { predicates: ['third'] });
                });
        });

        promiseIt('should throw error if no imposter file', function () {
            const repo = Repo.create({ imposterDir });

            return repo.first(stub => stub.predicates.length === 1).then(() => {
                assert.fail('should have rejected');
            }, err => {
                assert.deepEqual(err, {
                    code: 'corrupted database',
                    message: `no imposter file: ${imposterDir}/imposter.json`
                });
            });
        });
    });
});
