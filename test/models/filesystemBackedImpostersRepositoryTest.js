'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/filesystemBackedImpostersRepository'),
    Logger = require('../fakes/fakeLogger'),
    fs = require('fs-extra'),
    promiseIt = require('../testHelpers').promiseIt,
    mock = require('../mock').mock,
    Q = require('q'),
    isWindows = require('os').platform().indexOf('win') === 0,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000); // times out on Appveyor

describe('filesystemBackedImpostersRepository', function () {
    this.timeout(timeout);

    let logger, repo;

    beforeEach(function () {
        logger = Logger.create();
        repo = Repo.create({ datadir: '.mbtest' }, logger);
    });

    afterEach(function () {
        fs.removeSync('.mbtest');
    });

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

    function stripFunctions (obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    describe('#add', function () {
        promiseIt('should create a header file for imposter', function () {
            const imposter = { port: 1000, protocol: 'test', customField: true, stubs: [], requests: [] };

            return repo.add(imposterize(imposter)).then(() => {
                const saved = read('.mbtest/1000/imposter.json');
                assert.deepEqual(saved, { port: 1000, protocol: 'test', customField: true, stubs: [] });
            });
        });

        promiseIt('should add stubs for the imposter', function () {
            const imposter = {
                port: 1000,
                protocol: 'test',
                stubs: [{
                    responses: [{ is: { field: 'value' } }]
                }]
            };

            return repo.add(imposterize(imposter)).then(() => {
                const saved = read('.mbtest/1000/imposter.json');
                assert.strictEqual(saved.stubs.length, 1);

                const meta = read(`.mbtest/1000/${saved.stubs[0].meta.dir}/meta.json`);
                assert.strictEqual(meta.responseFiles.length, 1);

                const response = read(`.mbtest/1000/${saved.stubs[0].meta.dir}/${meta.responseFiles[0]}`);
                assert.deepEqual(response, { is: { field: 'value' } });
            });
        });

        if (!isWindows) {
            promiseIt('should deal with permission errors', function () {
                const imposter = { port: 1000, protocol: 'test' };

                repo = Repo.create({ datadir: '/.mbtest' }, logger);
                return repo.add(imposterize(imposter)).then(() => {
                    assert.fail('should not have been allowed');
                }, error => {
                    assert.deepEqual(error, {
                        code: 'insufficient access',
                        message: 'Run mb in superuser mode if you want access',
                        path: '/.mbtest/1000'
                    });
                });
            });
        }
    });

    describe('#addReference', function () {
        promiseIt('should allow loading without overwriting existing files', function () {
            const imposter = { port: 1000, protocol: 'test', fn: mock() },
                saved = { port: 1000, protocol: 'test', customField: true, stubs: [] };

            write('.mbtest/1000/imposter.json', saved);

            repo.addReference(imposterize(imposter));
            assert.deepEqual(read('.mbtest/1000/imposter.json'), saved);

            return repo.get(1000).then(retrieved => {
                retrieved.fn();
                assert.ok(imposter.fn.wasCalled());
            });
        });
    });

    describe('#all', function () {
        promiseIt('should not retrieve imposters in database that have not been added', function () {
            const imposter = { port: 1000, protocol: 'test' };

            // Simulate another process adding the imposter
            write('.mbtest/2000/imposter.json', { port: 2000, protocol: 'test' });

            return repo.add(imposterize(imposter))
                .then(() => repo.all())
                .then(all => {
                    assert.deepEqual(stripFunctions(all), [{ port: 1000, protocol: 'test', stubs: [] }]);
                });
        });
    });

    describe('#del', function () {
        promiseIt('should return imposter and delete all files', function () {
            const imposter = {
                port: 1000,
                protocol: 'test',
                stubs: [{
                    responses: [{ is: { key: 'value' } }]
                }]
            };

            return repo.add(imposterize(imposter))
                .then(() => repo.del(1000))
                .then(deleted => {
                    assert.strictEqual(fs.existsSync('.mbtest/1000'), false);
                    assert.deepEqual(stripFunctions(deleted), imposter);
                });
        });

        promiseIt('should call stop() even if another process has deleted the directory', function () {
            const imposter = { port: 1000, protocol: 'test', stop: mock().returns(Q()) };

            return repo.add(imposterize(imposter))
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
            const first = { port: 1000, protocol: 'test' },
                second = { port: 2000, protocol: 'test' };

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => repo.deleteAll())
                .then(() => {
                    assert.strictEqual(fs.existsSync('.mbtest'), false);
                });
        });

        promiseIt('calls stop() on all added imposters even if another process already deleted the database', function () {
            const first = { port: 1000, protocol: 'test', stop: mock().returns(Q()) },
                second = { port: 2000, protocol: 'test', stop: mock().returns(Q()) };

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => {
                    fs.removeSync('.mbtest');
                    return repo.deleteAll();
                }).then(() => {
                    assert.ok(first.stop.wasCalled());
                    assert.ok(second.stop.wasCalled());
                });
        });

        promiseIt('does not remove any files not referenced by the repository', function () {
            const imposter = { port: 1000, protocol: 'test' };

            write('.mbtest/2000/imposter.json', { port: 2000, protocol: 'test' });

            return repo.add(imposterize(imposter))
                .then(() => repo.deleteAll())
                .then(() => {
                    assert.strictEqual(fs.existsSync('.mbtest/2000/imposter.json'), true);
                });
        });
    });

    describe('#stopAllSync', function () {
        promiseIt('calls stop() on all added imposters even if another process already deleted the database', function () {
            const first = { port: 1000, protocol: 'test', stop: mock().returns(Q()) },
                second = { port: 2000, protocol: 'test', stop: mock().returns(Q()) };

            return repo.add(imposterize(first))
                .then(() => repo.add(imposterize(second)))
                .then(() => {
                    fs.removeSync('.mbtest');
                    repo.stopAllSync();
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
                        stubs: []
                    },
                    stub = {
                        predicates: [{ equals: { field: 'request' } }],
                        responses: [{ is: { field: 'response' } }]
                    };

                return repo.add(imposterize(imposter))
                    .then(() => stubs.add(stub))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDir = header.stubs[0].meta.dir;

                        assert.deepEqual(header, {
                            port: 3000,
                            protocol: 'test',
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
                        predicates: [{ equals: { field: 'request-0' } }],
                        responses: [{ is: { field: 'response-0' } }]
                    },
                    secondStub = {
                        predicates: [{ equals: { field: 'request-1' } }],
                        responses: [{ is: { field: 'response-1' } }]
                    },
                    imposter = { port: 3000, stubs: [firstStub] };

                return repo.add(imposterize(imposter))
                    .then(() => stubs.add(secondStub))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDirs = header.stubs.map(stub => stub.meta.dir);

                        assert.deepEqual(header, {
                            port: 3000,
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
                    },
                    imposter = { port: 3000, stubs: [] };

                return repo.add(imposterize(imposter))
                    .then(() => stubs.add(stub))
                    .then(() => {
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
                            { is: { field: 'first-response' }, repeat: 2 },
                            { is: { field: 'second-response' } },
                            { is: { field: 'third-response' }, repeat: 3 }
                        ]
                    },
                    imposter = { port: 3000, stubs: [] };

                return repo.add(imposterize(imposter))
                    .then(() => stubs.add(stub))
                    .then(() => {
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
                    },
                    imposter = { port: 3000 };

                return repo.add(imposterize(imposter))
                    .then(() => stubs.insertAtIndex(stub, 0))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDir = header.stubs[0].meta.dir;
                        assert.deepEqual(header, {
                            port: 3000,
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
                    first = {
                        predicates: [{ equals: { field: 'first-request' } }],
                        responses: [{ is: { field: 'first-response' } }]
                    },
                    second = {
                        predicates: [{ equals: { field: 'second-request' } }],
                        responses: [{ is: { field: 'second-response' } }]
                    },
                    imposter = { port: 3000, stubs: [first, second] },
                    newStub = {
                        predicates: [{ equals: { field: 'NEW-REQUEST' } }],
                        responses: [{ is: { field: 'NEW-RESPONSE' } }]
                    };

                return repo.add(imposterize(imposter))
                    .then(() => stubs.insertAtIndex(newStub, 1))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDirs = header.stubs.map(stub => stub.meta.dir);
                        assert.deepEqual(header, {
                            port: 3000,
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
                    first = {
                        predicates: [{ equals: { field: 'first-request' } }],
                        responses: [{ is: { field: 'first-response' } }]
                    },
                    second = {
                        predicates: [{ equals: { field: 'second-request' } }],
                        responses: [{ is: { field: 'second-response' } }]
                    },
                    third = {
                        predicates: [{ equals: { field: 'third-request' } }],
                        responses: [{ is: { field: 'third-response' } }]
                    },
                    imposter = { port: 3000, stubs: [first, second, third] };
                let stubDirToDelete;

                return repo.add(imposterize(imposter))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json');
                        stubDirToDelete = header.stubs[1].meta.dir;
                        return stubs.deleteAtIndex(1);
                    }).then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDirs = header.stubs.map(stub => stub.meta.dir);
                        assert.deepEqual(header, {
                            port: 3000,
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
                    first = {
                        predicates: [{ equals: { field: 'first-request' } }],
                        responses: [{ is: { field: 'first-response' } }]
                    },
                    second = {
                        predicates: [{ equals: { field: 'second-request' } }],
                        responses: [{ is: { field: 'second-response' } }]
                    },
                    imposter = { port: 3000, stubs: [first, second] },
                    newStub = {
                        predicates: [{ equals: { field: 'third-request' } }],
                        responses: [{ is: { field: 'third-response' } }]
                    };
                let stubDirToDelete;

                return repo.add(imposterize(imposter))
                    .then(() => {
                        const header = read('.mbtest/3000/imposter.json');
                        stubDirToDelete = header.stubs[0].meta.dir;
                        return stubs.overwriteAtIndex(newStub, 0);
                    }).then(() => {
                        const header = read('.mbtest/3000/imposter.json'),
                            stubDirs = header.stubs.map(stub => stub.meta.dir);
                        assert.deepEqual(read('.mbtest/3000/imposter.json'), {
                            port: 3000,
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
                    },
                    imposter = { port: 3000, stubs: [stub] };
                let responsePath;

                return repo.add(imposterize(imposter)).then(() => {
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
                    assert.strictEqual(err.code, 'corrupted database');
                    assert.strictEqual(err.message, 'file not found');
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
                    },
                    imposter = { port: 3000, stubs: [stub] };
                let metaPath;

                return repo.add(imposterize(imposter)).then(() => {
                    const header = read('.mbtest/3000/imposter.json'),
                        stubDir = header.stubs[0].meta.dir;
                    metaPath = `.mbtest/3000/${stubDir}/meta.json`;
                    fs.removeSync(metaPath);
                    return stubs.toJSON();
                }).then(() => {
                    assert.fail('should have errored');
                }).catch(err => {
                    assert.strictEqual(err.code, 'corrupted database');
                    assert.strictEqual(err.message, 'file not found');
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
                    },
                    imposter = { port: 3000, stubs: [stub] };
                let responsePath;

                return repo.add(imposterize(imposter)).then(() => {
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

        describe('#deleteSavedRequests', function () {
            promiseIt('should delete the imposter\'s requests/ directory', function () {
                const stubs = repo.stubsFor(3000),
                    imposter = { port: 3000, protocol: 'test', stubs: [] };

                return repo.add(imposterize(imposter))
                    .then(() => stubs.addRequest({ field: 'value' })
                        .then(() => {
                            const requestFiles = fs.readdirSync('.mbtest/3000/requests');
                            assert(requestFiles.length, 1);
                        })
                        .then(() => stubs.loadRequests())
                        .then(requests => {
                            assert.deepEqual(requests, [{ field: 'value', timestamp: requests[0].timestamp }]);
                        })
                        .then(() => stubs.deleteSavedRequests())
                        .then(() => {
                            const imposterDir = fs.readdirSync('.mbtest/3000');
                            assert(imposterDir.includes('requests') === false);
                        }));
            });
        });
    });
});
