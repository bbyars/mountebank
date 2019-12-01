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

    function stripFunctions (obj) {
        return JSON.parse(JSON.stringify(obj));
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
                            dir: 'stubs/0',
                            responseFiles: ['responses/0.json'],
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
                                    dir: 'stubs/0',
                                    responseFiles: ['responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            },
                            {
                                predicates: [{ equals: { field: 'second-request' } }],
                                meta: {
                                    dir: 'stubs/1',
                                    responseFiles: ['responses/0.json'],
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
                            dir: 'stubs/0',
                            responseFiles: ['responses/0.json', 'responses/1.json'],
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
                            dir: 'stubs/0',
                            responseFiles: ['responses/0.json', 'responses/1.json', 'responses/2.json'],
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

    describe('#count', function () {
        promiseIt('should be 0 if no stubs added', function () {
            const repo = Repo.create({ imposterDir });
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.count().then(count => {
                assert.strictEqual(count, 0);
            });
        });

        promiseIt('should count all stubs added', function () {
            const repo = Repo.create({ imposterDir });
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add({ predicates: ['first'] })
                .then(() => repo.add({ predicates: ['second'] }))
                .then(() => repo.count())
                .then(count => {
                    assert.strictEqual(count, 2);
                });
        });
    });

    describe('#first', function () {
        promiseIt('should indicate no match', function () {
            const repo = Repo.create({ imposterDir });
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.first(stub => stub.predicates.length === 1).then(match => {
                assert.ok(!match.success);
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
                    assert.ok(match.success);
                    assert.strictEqual(match.index, 1);
                    assert.deepEqual(stripFunctions(match.stub), { predicates: ['third'] });
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

    describe('#insertAtIndex', function () {
        promiseIt('should create stub files if empty stubs array and inserting at index 0', function () {
            const repo = Repo.create({ imposterDir }),
                stub = {
                    predicates: [{ equals: { field: 'request' } }],
                    responses: [{ is: { field: 'response' } }]
                };
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.insertAtIndex(stub, 0).then(() => {
                assert.deepEqual(read('imposter.json'), {
                    port: 3000,
                    protocol: 'test',
                    stubs: [{
                        predicates: [{ equals: { field: 'request' } }],
                        meta: {
                            dir: 'stubs/0',
                            responseFiles: ['responses/0.json'],
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
                },
                newStub = {
                    predicates: [{ equals: { field: 'NEW-REQUEST' } }],
                    responses: [{ is: { field: 'NEW-RESPONSE' } }]
                };
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add(firstStub)
                .then(() => repo.add(secondStub))
                .then(() => repo.insertAtIndex(newStub, 1))
                .then(() => {
                    assert.deepEqual(read('imposter.json'), {
                        port: 3000,
                        protocol: 'test',
                        stubs: [
                            {
                                predicates: [{ equals: { field: 'first-request' } }],
                                meta: {
                                    dir: 'stubs/0',
                                    responseFiles: ['responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            },
                            {
                                predicates: [{ equals: { field: 'NEW-REQUEST' } }],
                                meta: {
                                    dir: 'stubs/2',
                                    responseFiles: ['responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            },
                            {
                                predicates: [{ equals: { field: 'second-request' } }],
                                meta: {
                                    dir: 'stubs/1',
                                    responseFiles: ['responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            }
                        ]
                    });

                    assert.deepEqual(read('stubs/2/responses/0.json'),
                        { is: { field: 'NEW-RESPONSE' } });
                });
        });
    });

    describe('#deleteAtIndex', function () {
        promiseIt('should reject the promise if no stub at that index', function () {
            const repo = Repo.create({ imposterDir });
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.deleteAtIndex(0).then(() => {
                assert.fail('Should have rejected');
            }, err => {
                assert.deepEqual(err, {
                    code: 'no such resource',
                    message: 'no stub at index 0'
                });
            });
        });

        promiseIt('should delete stub and stub dir at specified index', function () {
            const repo = Repo.create({ imposterDir }),
                firstStub = {
                    predicates: [{ equals: { field: 'first-request' } }],
                    responses: [{ is: { field: 'first-response' } }]
                },
                secondStub = {
                    predicates: [{ equals: { field: 'second-request' } }],
                    responses: [{ is: { field: 'second-response' } }]
                },
                thirdStub = {
                    predicates: [{ equals: { field: 'third-request' } }],
                    responses: [{ is: { field: 'third-response' } }]
                };
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add(firstStub)
                .then(() => repo.add(secondStub))
                .then(() => repo.add(thirdStub))
                .then(() => repo.deleteAtIndex(1))
                .then(() => {
                    assert.deepEqual(read('imposter.json'), {
                        port: 3000,
                        protocol: 'test',
                        stubs: [
                            {
                                predicates: [{ equals: { field: 'first-request' } }],
                                meta: {
                                    dir: 'stubs/0',
                                    responseFiles: ['responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            },
                            {
                                predicates: [{ equals: { field: 'third-request' } }],
                                meta: {
                                    dir: 'stubs/2',
                                    responseFiles: ['responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            }
                        ]
                    });

                    assert.ok(!fs.existsSync(`${imposterDir}/stubs/1`));
                });
        });
    });

    describe('#overwriteAll', function () {
        promiseIt('should add if no stubs previously added', function () {
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

            return repo.overwriteAll([firstStub, secondStub]).then(() => {
                assert.deepEqual(read('imposter.json'), {
                    port: 3000,
                    protocol: 'test',
                    stubs: [
                        {
                            predicates: [{ equals: { field: 'first-request' } }],
                            meta: {
                                dir: 'stubs/0',
                                responseFiles: ['responses/0.json'],
                                orderWithRepeats: [0],
                                nextIndex: 0
                            }
                        },
                        {
                            predicates: [{ equals: { field: 'second-request' } }],
                            meta: {
                                dir: 'stubs/1',
                                responseFiles: ['responses/0.json'],
                                orderWithRepeats: [0],
                                nextIndex: 0
                            }
                        }
                    ]
                });
            });
        });

        promiseIt('should replace existing stubs', function () {
            const repo = Repo.create({ imposterDir }),
                stubs = [];

            for (let i = 0; i < 4; i += 1) {
                stubs.push({
                    predicates: [{ equals: { field: `request-${i}` } }],
                    responses: [{ is: { field: `response-${i}` } }]
                });
            }
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add(stubs[0])
                .then(() => repo.add(stubs[1]))
                .then(() => repo.overwriteAll([stubs[2], stubs[3]]))
                .then(() => {
                    assert.deepEqual(read('imposter.json'), {
                        port: 3000,
                        protocol: 'test',
                        stubs: [
                            {
                                predicates: [{ equals: { field: 'request-2' } }],
                                meta: {
                                    dir: 'stubs/0',
                                    responseFiles: ['responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            },
                            {
                                predicates: [{ equals: { field: 'request-3' } }],
                                meta: {
                                    dir: 'stubs/1',
                                    responseFiles: ['responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            }
                        ]
                    });

                    assert.deepEqual(read('stubs/0/responses/0.json'),
                        { is: { field: 'response-2' } });
                    assert.deepEqual(read('stubs/1/responses/0.json'),
                        { is: { field: 'response-3' } });
                });
        });
    });

    describe('#overwriteAtIndex', function () {
        promiseIt('should reject the promise if no stub at that index', function () {
            const repo = Repo.create({ imposterDir });
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.overwriteAtIndex({}, 0).then(() => {
                assert.fail('Should have rejected');
            }, err => {
                assert.deepEqual(err, {
                    code: 'no such resource',
                    message: 'no stub at index 0'
                });
            });
        });

        promiseIt('should overwrite at given index', function () {
            const repo = Repo.create({ imposterDir }),
                firstStub = {
                    predicates: [{ equals: { field: 'first-request' } }],
                    responses: [{ is: { field: 'first-response' } }]
                },
                secondStub = {
                    predicates: [{ equals: { field: 'second-request' } }],
                    responses: [{ is: { field: 'second-response' } }]
                },
                thirdStub = {
                    predicates: [{ equals: { field: 'third-request' } }],
                    responses: [{ is: { field: 'third-response' } }]
                };
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add(firstStub)
                .then(() => repo.add(secondStub))
                .then(() => repo.overwriteAtIndex(thirdStub, 0))
                .then(() => {
                    assert.deepEqual(read('imposter.json'), {
                        port: 3000,
                        protocol: 'test',
                        stubs: [
                            {
                                predicates: [{ equals: { field: 'third-request' } }],
                                meta: {
                                    dir: 'stubs/2',
                                    responseFiles: ['responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            },
                            {
                                predicates: [{ equals: { field: 'second-request' } }],
                                meta: {
                                    dir: 'stubs/1',
                                    responseFiles: ['responses/0.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            }
                        ]
                    });
                });
        });
    });

    describe('#all', function () {
        promiseIt('should return all stubs with predicates', function () {
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
                .then(() => repo.all())
                .then(stubs => {
                    assert.deepEqual(stripFunctions(stubs), [
                        { predicates: [{ equals: { field: 'first-request' } }] },
                        { predicates: [{ equals: { field: 'second-request' } }] }
                    ]);
                });
        });

        promiseIt('should allow adding responses', function () {
            const repo = Repo.create({ imposterDir }),
                stub = {
                    predicates: [{ equals: { field: 'request' } }],
                    responses: [{ is: { field: 'response' } }]
                };
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add(stub)
                .then(() => repo.all())
                .then(stubs => stubs[0].addResponse({ is: { field: 'NEW-RESPONSE' } }))
                .then(() => {
                    assert.deepEqual(read('imposter.json'), {
                        port: 3000,
                        protocol: 'test',
                        stubs: [
                            {
                                predicates: [{ equals: { field: 'request' } }],
                                meta: {
                                    dir: 'stubs/0',
                                    responseFiles: ['responses/0.json', 'responses/1.json'],
                                    orderWithRepeats: [0, 1],
                                    nextIndex: 0
                                }
                            }
                        ]
                    });

                    assert.deepEqual(read('stubs/0/responses/1.json'), { is: { field: 'NEW-RESPONSE' } });
                });
        });

        promiseIt('should allow deleting responses', function () {
            const repo = Repo.create({ imposterDir }),
                stub = {
                    predicates: [{ equals: { field: 'request' } }],
                    responses: [{ is: { field: 'first' } }, { is: { field: 'second' } }]
                };
            write('imposter.json', { port: 3000, protocol: 'test' });

            return repo.add(stub)
                .then(() => repo.all())
                .then(stubs => stubs[0].deleteResponsesMatching(response => response.is.field === 'first'))
                .then(() => {
                    assert.deepEqual(read('imposter.json'), {
                        port: 3000,
                        protocol: 'test',
                        stubs: [
                            {
                                predicates: [{ equals: { field: 'request' } }],
                                meta: {
                                    dir: 'stubs/0',
                                    responseFiles: ['responses/1.json'],
                                    orderWithRepeats: [0],
                                    nextIndex: 0
                                }
                            }
                        ]
                    });

                    assert.ok(!fs.existsSync('.mbtest/3000/stubs/0/responses/0.json'));
                });
        });
    });
});
