'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/filesystemBackedImpostersRepository'),
    Logger = require('../fakes/fakeLogger'),
    fs = require('fs-extra'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    Q = require('q');

describe('filesystemBackedImpostersRepository', function () {
    let logger, repo;

    beforeEach(function () {
        logger = Logger.create();
        repo = Repo.create({ datadir: '.mbtest' }, logger);
    });

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
            return repo.add({ port: 1000, protocol: 'test', customField: true, stubs: [], requests: [] }).then(() => {
                const saved = read('.mbtest/1000/imposter.json');
                assert.deepEqual(saved, { port: 1000, protocol: 'test', customField: true, stubs: [] });
            });
        });

        promiseIt('should not add stubs for the imposter (stubsFor.add does that)', function () {
            const imposter = {
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
            const stubs = repo.stubsFor(1000),
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
            const first = { port: 1000, protocol: 'test' },
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
            const imposter = {
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
            const imposter = { port: 1000, protocol: 'test', stop: mock().returns(Q()) };

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
            return repo.deleteAll().then(() => {
                assert.strictEqual(fs.existsSync('.mbtest'), false);
            });
        });

        promiseIt('removes all added imposters from the filesystem', function () {
            return repo.add({ port: 1000, protocol: 'test' })
                .then(() => repo.add({ port: 2000, protocol: 'test' }))
                .then(() => repo.deleteAll())
                .then(() => {
                    assert.strictEqual(fs.existsSync('.mbtest'), false);
                });
        });

        promiseIt('calls stop() on all added imposters even if another process already deleted the database', function () {
            const first = { port: 1000, protocol: 'test', stop: mock().returns(Q()) },
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
            return repo.add({ port: 1000, protocol: 'test' })
                .then(() => repo.add({ port: 2000, protocol: 'test' }))
                .then(() => {
                    repo.deleteAllSync();
                    assert.strictEqual(fs.existsSync('.mbtest'), false);
                });
        });

        promiseIt('calls stop() on all added imposters even if another process already deleted the database', function () {
            const first = { port: 1000, protocol: 'test', stop: mock().returns(Q()) },
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

    describe('#stubsFor', function () {
        describe('#add', function () {
            promiseIt('should merge stubs with imposter header information', function () {
                const stubs = repo.stubsFor(3000),
                    imposter = {
                        port: 3000,
                        protocol: 'test',
                        stubs: [{
                            predicates: [{ equals: { field: 'request' } }],
                            responses: [{ is: { field: 'response' } }]
                        }]
                    };

                return stubs.add(imposter.stubs[0])
                    .then(() => repo.add(imposter))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDir = header.stubs[0].meta.dir;

                        assert.deepEqual(header, {
                            port: 3000,
                            protocol: 'test',
                            stubs: [{
                                predicates: [{ equals: { field: 'request' } }],
                                meta: {
                                    dir: stubDir
                                }
                            }]
                        });

                        const meta = read(`.mbtest/3000/${stubDir}/meta.json`),
                            responseFile = meta.responseFiles[0];

                        assert.deepEqual(meta, {
                            responseFiles: [responseFile],
                            orderWithRepeats: [0],
                            nextIndex: 0
                        });

                        assert.deepEqual(read(`.mbtest/3000/${stubDir}/${responseFile}`), { is: { field: 'response' } });
                    });
            });

            promiseIt('should add to stubs file if it already exists', function () {
                const stubs = repo.stubsFor(3000),
                    firstStub = {
                        predicates: [{ equals: { field: 'request-0' } }],
                        responses: [{ is: { field: 'response-0' } }]
                    },
                    secondStub = {
                        predicates: [{ equals: { field: 'request-1' } }],
                        responses: [{ is: { field: 'response-1' } }]
                    };

                return stubs.add(firstStub)
                    .then(() => stubs.add(secondStub))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDirs = header.stubs.map(stub => stub.meta.dir);

                        assert.deepEqual(header, {
                            stubs: [
                                {
                                    predicates: [{ equals: { field: 'request-0' } }],
                                    meta: { dir: stubDirs[0] }
                                },
                                {
                                    predicates: [{ equals: { field: 'request-1' } }],
                                    meta: { dir: stubDirs[1] }
                                }
                            ]
                        });

                        stubDirs.forEach((stubDir, index) => {
                            const meta = read(`.mbtest/3000/${stubDir}/meta.json`),
                                responseFile = meta.responseFiles[0];

                            assert.deepEqual(meta, {
                                responseFiles: [responseFile],
                                orderWithRepeats: [0],
                                nextIndex: 0
                            });
                            assert.deepEqual(read(`.mbtest/3000/${stubDir}/${responseFile}`),
                                { is: { field: `response-${index}` } });
                        });
                    });
            });

            promiseIt('should save multiple responses in separate files', function () {
                const stubs = repo.stubsFor(3000),
                    stub = {
                        predicates: [{ equals: { field: 'request' } }],
                        responses: [
                            { is: { field: 'first-response' } },
                            { is: { field: 'second-response' } }
                        ]
                    };

                return stubs.add(stub).then(() => {
                    const header = read('.mbtest/3000/imposter.json'),
                        stubDir = header.stubs[0].meta.dir,
                        meta = read(`.mbtest/3000/${stubDir}/meta.json`),
                        responseFiles = meta.responseFiles;

                    assert.deepEqual(meta, {
                        responseFiles: responseFiles,
                        orderWithRepeats: [0, 1],
                        nextIndex: 0
                    });
                    assert.deepEqual(read(`.mbtest/3000/${stubDir}/${responseFiles[0]}`), { is: { field: 'first-response' } });
                    assert.deepEqual(read(`.mbtest/3000/${stubDir}/${responseFiles[1]}`), { is: { field: 'second-response' } });
                });
            });

            promiseIt('should apply repeat behavior', function () {
                const stubs = repo.stubsFor(3000),
                    stub = {
                        predicates: [{ equals: { field: 'request' } }],
                        responses: [
                            { is: { field: 'first-response' }, _behaviors: { repeat: 2 } },
                            { is: { field: 'second-response' } },
                            { is: { field: 'third-response' }, _behaviors: { repeat: 3 } }
                        ]
                    };

                return stubs.add(stub).then(() => {
                    const header = read('.mbtest/3000/imposter.json'),
                        stubDir = header.stubs[0].meta.dir,
                        meta = read(`.mbtest/3000/${stubDir}/meta.json`);

                    assert.deepEqual(meta, {
                        responseFiles: meta.responseFiles,
                        orderWithRepeats: [0, 0, 1, 2, 2, 2],
                        nextIndex: 0
                    });
                });
            });
        });

        describe('#insertAtIndex', function () {
            promiseIt('should create stub files if empty stubs array and inserting at index 0', function () {
                const stubs = repo.stubsFor(3000),
                    stub = {
                        predicates: [{ equals: { field: 'request' } }],
                        responses: [{ is: { field: 'response' } }]
                    };

                return stubs.insertAtIndex(stub, 0).then(() => {
                    const header = read('.mbtest/3000/imposter.json'),
                        stubDir = header.stubs[0].meta.dir;
                    assert.deepEqual(header, {
                        stubs: [{
                            predicates: [{ equals: { field: 'request' } }],
                            meta: { dir: stubDir }
                        }]
                    });

                    const meta = read(`.mbtest/3000/${stubDir}/meta.json`),
                        responseFile = meta.responseFiles[0];
                    assert.deepEqual(meta, {
                        responseFiles: [responseFile],
                        orderWithRepeats: [0],
                        nextIndex: 0
                    });
                    assert.deepEqual(read(`.mbtest/3000/${stubDir}/${responseFile}`), { is: { field: 'response' } });
                });
            });

            promiseIt('should add to stubs file if it already exists', function () {
                const stubs = repo.stubsFor(3000),
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

                return stubs.add(firstStub)
                    .then(() => stubs.add(secondStub))
                    .then(() => stubs.insertAtIndex(newStub, 1))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDirs = header.stubs.map(stub => stub.meta.dir);
                        assert.deepEqual(header, {
                            stubs: [
                                {
                                    predicates: [{ equals: { field: 'first-request' } }],
                                    meta: { dir: stubDirs[0] }
                                },
                                {
                                    predicates: [{ equals: { field: 'NEW-REQUEST' } }],
                                    meta: { dir: stubDirs[1] }
                                },
                                {
                                    predicates: [{ equals: { field: 'second-request' } }],
                                    meta: { dir: stubDirs[2] }
                                }
                            ]
                        });

                        const meta = read(`.mbtest/3000/${stubDirs[1]}/meta.json`),
                            responseFile = meta.responseFiles[0];
                        assert.deepEqual(read(`.mbtest/3000/${stubDirs[1]}/${responseFile}`),
                            { is: { field: 'NEW-RESPONSE' } });
                    });
            });
        });

        describe('#deleteAtIndex', function () {
            promiseIt('should delete stub and stub dir at specified index', function () {
                const stubs = repo.stubsFor(3000),
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
                let stubDirToDelete;

                return stubs.add(firstStub)
                    .then(() => stubs.add(secondStub))
                    .then(() => stubs.add(thirdStub))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json');
                        stubDirToDelete = header.stubs[1].meta.dir;
                        return stubs.deleteAtIndex(1);
                    }).then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDirs = header.stubs.map(stub => stub.meta.dir);
                        assert.deepEqual(header, {
                            stubs: [
                                {
                                    predicates: [{ equals: { field: 'first-request' } }],
                                    meta: { dir: stubDirs[0] }
                                },
                                {
                                    predicates: [{ equals: { field: 'third-request' } }],
                                    meta: { dir: stubDirs[1] }
                                }
                            ]
                        });

                        assert.ok(!fs.existsSync(`.mbtest/3000/${stubDirToDelete}`));
                    });
            });
        });

        describe('#overwriteAtIndex', function () {
            promiseIt('should overwrite at given index', function () {
                const stubs = repo.stubsFor(3000),
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
                let stubDirToDelete;

                return stubs.add(firstStub)
                    .then(() => stubs.add(secondStub))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json');
                        stubDirToDelete = header.stubs[0].meta.dir;
                        return stubs.overwriteAtIndex(thirdStub, 0);
                    }).then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDirs = header.stubs.map(stub => stub.meta.dir);
                        assert.deepEqual(read('.mbtest/3000/imposter.json'), {
                            stubs: [
                                {
                                    predicates: [{ equals: { field: 'third-request' } }],
                                    meta: { dir: stubDirs[0] }
                                },
                                {
                                    predicates: [{ equals: { field: 'second-request' } }],
                                    meta: { dir: stubDirs[1] }
                                }
                            ]
                        });

                        assert.ok(!fs.existsSync(`.mbtest/3000/${stubDirToDelete}`));
                    });
            });
        });

        describe('#toJSON', function () {
            promiseIt('should error if database corrupted via deleted response file', function () {
                const stubs = repo.stubsFor(3000),
                    stub = {
                        predicates: [{ equals: { field: 'request' } }],
                        responses: [
                            { is: { field: 'first-response' } },
                            { is: { field: 'second-response' } }
                        ]
                    };
                let responsePath;

                return stubs.add(stub).then(() => {
                    const header = read('.mbtest/3000/imposter.json'),
                        stubDir = header.stubs[0].meta.dir,
                        meta = read(`.mbtest/3000/${stubDir}/meta.json`),
                        lastResponseFile = meta.responseFiles[1];

                    responsePath = `.mbtest/3000/${stubDir}/${lastResponseFile}`;
                    fs.removeSync(responsePath);
                    return stubs.toJSON();
                }).then(() => {
                    assert.fail('should have errored');
                }).catch(err => {
                    assert.deepEqual(err, {
                        code: 'corrupted database',
                        message: 'file not found',
                        details: `ENOENT: no such file or directory, open '${responsePath}'`
                    });
                });
            });

            promiseIt('should error if database corrupted via deleted meta file', function () {
                const stubs = repo.stubsFor(3000),
                    stub = {
                        predicates: [{ equals: { field: 'request' } }],
                        responses: [
                            { is: { field: 'first-response' } },
                            { is: { field: 'second-response' } }
                        ]
                    };
                let metaPath;

                return stubs.add(stub).then(() => {
                    const header = read('.mbtest/3000/imposter.json'),
                        stubDir = header.stubs[0].meta.dir;
                    metaPath = `.mbtest/3000/${stubDir}/meta.json`;
                    fs.removeSync(metaPath);
                    return stubs.toJSON();
                }).then(() => {
                    assert.fail('should have errored');
                }).catch(err => {
                    assert.deepEqual(err, {
                        code: 'corrupted database',
                        message: 'file not found',
                        details: `ENOENT: no such file or directory, open '${metaPath}'`
                    });
                });
            });

            promiseIt('should error if database corrupted via corrupted JSON', function () {
                const stubs = repo.stubsFor(3000),
                    stub = {
                        predicates: [{ equals: { field: 'request' } }],
                        responses: [
                            { is: { field: 'first-response' } },
                            { is: { field: 'second-response' } }
                        ]
                    };
                let responsePath;

                return stubs.add(stub).then(() => {
                    const header = read('.mbtest/3000/imposter.json'),
                        stubDir = header.stubs[0].meta.dir,
                        meta = read(`.mbtest/3000/${stubDir}/meta.json`),
                        lastResponseFile = meta.responseFiles[1];
                    responsePath = `.mbtest/3000/${stubDir}/${lastResponseFile}`;

                    fs.writeFileSync(responsePath, 'CORRUPTED');
                    return stubs.toJSON();
                }).then(() => {
                    assert.fail('should have errored');
                }).catch(err => {
                    assert.deepEqual(err, {
                        code: 'corrupted database',
                        message: `invalid JSON in ${responsePath}`,
                        details: 'Unexpected token C in JSON at position 0'
                    });
                });
            });
        });
    });
});
