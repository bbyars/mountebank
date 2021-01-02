'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/filesystemBackedImpostersRepository'),
    Logger = require('../fakes/fakeLogger'),
    fs = require('fs-extra'),
    mock = require('../mock').mock,
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
        it('should create a header file for imposter', async function () {
            const imposter = { port: 1000, protocol: 'test', customField: true, stubs: [], requests: [] };

            await repo.add(imposterize(imposter));
            const saved = read('.mbtest/1000/imposter.json');
            assert.deepEqual(saved, { port: 1000, protocol: 'test', customField: true, stubs: [] });
        });

        it('should add stubs for the imposter', async function () {
            const imposter = {
                port: 1000,
                protocol: 'test',
                stubs: [{
                    responses: [{ is: { field: 'value' } }]
                }]
            };

            await repo.add(imposterize(imposter));
            const saved = read('.mbtest/1000/imposter.json');
            assert.strictEqual(saved.stubs.length, 1);

            const meta = read(`.mbtest/1000/${saved.stubs[0].meta.dir}/meta.json`);
            assert.strictEqual(meta.responseFiles.length, 1);

            const response = read(`.mbtest/1000/${saved.stubs[0].meta.dir}/${meta.responseFiles[0]}`);
            assert.deepEqual(response, { is: { field: 'value' } });
        });
    });

    describe('#addReference', function () {
        it('should allow loading without overwriting existing files', async function () {
            const imposter = { port: 1000, protocol: 'test', fn: mock() },
                saved = { port: 1000, protocol: 'test', customField: true, stubs: [] };

            write('.mbtest/1000/imposter.json', saved);

            repo.addReference(imposterize(imposter));
            assert.deepEqual(read('.mbtest/1000/imposter.json'), saved);

            const retrieved = await repo.get(1000);
            retrieved.fn();
            assert.ok(imposter.fn.wasCalled());
        });
    });

    describe('#all', function () {
        it('should not retrieve imposters in database that have not been added', async function () {
            const imposter = { port: 1000, protocol: 'test' };

            // Simulate another process adding the imposter
            write('.mbtest/2000/imposter.json', { port: 2000, protocol: 'test' });

            await repo.add(imposterize(imposter));
            const all = await repo.all();

            assert.deepEqual(stripFunctions(all), [{ port: 1000, protocol: 'test', stubs: [] }]);
        });
    });

    describe('#del', function () {
        it('should return imposter and delete all files', async function () {
            const imposter = {
                port: 1000,
                protocol: 'test',
                stubs: [{
                    responses: [{ is: { key: 'value' } }]
                }]
            };

            await repo.add(imposterize(imposter));
            const deleted = await repo.del(1000);

            assert.strictEqual(fs.existsSync('.mbtest/1000'), false);
            assert.deepEqual(stripFunctions(deleted), imposter);
        });

        it('should call stop() even if another process has deleted the directory', async function () {
            const imposter = {
                port: 1000,
                protocol: 'test',
                stop: mock().returns(Promise.resolve())
            };

            await repo.add(imposterize(imposter));
            fs.removeSync('.mbtest/1000');
            await repo.del(1000);

            assert.ok(imposter.stop.wasCalled());
        });

        describe('#deleteAll', function () {
            it('does nothing if no database', async function () {
                await repo.deleteAll();
                assert.strictEqual(fs.existsSync('.mbtest'), false);
            });

            it('removes all added imposters from the filesystem', async function () {
                const first = { port: 1000, protocol: 'test' },
                    second = { port: 2000, protocol: 'test' };

                await repo.add(imposterize(first));
                await repo.add(imposterize(second));
                await repo.deleteAll();

                assert.strictEqual(fs.existsSync('.mbtest'), false);
            });

            it('calls stop() on all added imposters even if another process already deleted the database', async function () {
                const first = { port: 1000, protocol: 'test', stop: mock().returns(Promise.resolve()) },
                    second = { port: 2000, protocol: 'test', stop: mock().returns(Promise.resolve()) };

                await repo.add(imposterize(first));
                await repo.add(imposterize(second));
                fs.removeSync('.mbtest');
                await repo.deleteAll();

                assert.ok(first.stop.wasCalled());
                assert.ok(second.stop.wasCalled());
            });

            it('does not remove any files not referenced by the repository', async function () {
                const imposter = { port: 1000, protocol: 'test' };

                write('.mbtest/2000/imposter.json', { port: 2000, protocol: 'test' });

                await repo.add(imposterize(imposter));
                await repo.deleteAll();

                assert.strictEqual(fs.existsSync('.mbtest/2000/imposter.json'), true);
            });
        });

        describe('#stopAllSync', function () {
            it('calls stop() on all added imposters even if another process already deleted the database', async function () {
                const first = { port: 1000, protocol: 'test', stop: mock().returns(Promise.resolve()) },
                    second = { port: 2000, protocol: 'test', stop: mock().returns(Promise.resolve()) };

                await repo.add(imposterize(first));
                await repo.add(imposterize(second));
                fs.removeSync('.mbtest');
                repo.stopAllSync();

                assert.ok(first.stop.wasCalled());
                assert.ok(second.stop.wasCalled());
            });
        });

        describe('#stubsFor', function () {
            describe('#add', function () {
                it('should merge stubs with imposter header information', async function () {
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

                    await repo.add(imposterize(imposter));
                    await stubs.add(stub);

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

                it('should add to stubs file if it already exists', async function () {
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

                    await repo.add(imposterize(imposter));
                    await stubs.add(secondStub);

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

                it('should save multiple responses in separate files', async function () {
                    const stubs = repo.stubsFor(3000),
                        stub = {
                            predicates: [{ equals: { field: 'request' } }],
                            responses: [
                                { is: { field: 'first-response' } },
                                { is: { field: 'second-response' } }
                            ]
                        },
                        imposter = { port: 3000, stubs: [] };

                    await repo.add(imposterize(imposter));
                    await stubs.add(stub);

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

                it('should apply repeat behavior', async function () {
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

                    await repo.add(imposterize(imposter));
                    await stubs.add(stub);

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

            describe('#insertAtIndex', function () {
                it('should create stub files if empty stubs array and inserting at index 0', async function () {
                    const stubs = repo.stubsFor(3000),
                        stub = {
                            predicates: [{ equals: { field: 'request' } }],
                            responses: [{ is: { field: 'response' } }]
                        },
                        imposter = { port: 3000 };

                    await repo.add(imposterize(imposter));
                    await stubs.insertAtIndex(stub, 0);

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

                it('should add to stubs file if it already exists', async function () {
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

                    await repo.add(imposterize(imposter));
                    await stubs.insertAtIndex(newStub, 1);

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

            describe('#deleteAtIndex', function () {
                it('should delete stub and stub dir at specified index', async function () {
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

                    await repo.add(imposterize(imposter));
                    const header = read('.mbtest/3000/imposter.json');
                    const stubDirToDelete = header.stubs[1].meta.dir;
                    await stubs.deleteAtIndex(1);

                    const newHeader = read('.mbtest/3000/imposter.json'),
                        stubDirs = newHeader.stubs.map(stub => stub.meta.dir);
                    assert.deepEqual(newHeader, {
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

            describe('#overwriteAtIndex', function () {
                it('should overwrite at given index', async function () {
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

                    await repo.add(imposterize(imposter));
                    const header = read('.mbtest/3000/imposter.json');
                    const stubDirToDelete = header.stubs[0].meta.dir;
                    await stubs.overwriteAtIndex(newStub, 0);

                    const newHeader = read('.mbtest/3000/imposter.json'),
                        stubDirs = newHeader.stubs.map(stub => stub.meta.dir);
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

            describe('#toJSON', function () {
                it('should error if database corrupted via deleted response file', async function () {
                    const stubs = repo.stubsFor(3000),
                        stub = {
                            predicates: [{ equals: { field: 'request' } }],
                            responses: [
                                { is: { field: 'first-response' } },
                                { is: { field: 'second-response' } }
                            ]
                        },
                        imposter = { port: 3000, stubs: [stub] };

                    await repo.add(imposterize(imposter));

                    const header = read('.mbtest/3000/imposter.json'),
                        stubDir = header.stubs[0].meta.dir,
                        meta = read(`.mbtest/3000/${stubDir}/meta.json`),
                        lastResponseFile = meta.responseFiles[1],
                        responsePath = `.mbtest/3000/${stubDir}/${lastResponseFile}`;
                    fs.removeSync(responsePath);

                    try {
                        await stubs.toJSON();
                        assert.fail('should have errored');
                    }
                    catch (err) {
                        assert.strictEqual(err.code, 'corrupted database');
                        assert.strictEqual(err.message, 'file not found');
                    }
                });

                it('should error if database corrupted via deleted meta file', async function () {
                    const stubs = repo.stubsFor(3000),
                        stub = {
                            predicates: [{ equals: { field: 'request' } }],
                            responses: [
                                { is: { field: 'first-response' } },
                                { is: { field: 'second-response' } }
                            ]
                        },
                        imposter = { port: 3000, stubs: [stub] };

                    await repo.add(imposterize(imposter));
                    const header = read('.mbtest/3000/imposter.json'),
                        stubDir = header.stubs[0].meta.dir,
                        metaPath = `.mbtest/3000/${stubDir}/meta.json`;
                    fs.removeSync(metaPath);

                    try {
                        await stubs.toJSON();
                        assert.fail('should have errored');
                    }
                    catch (err) {
                        assert.strictEqual(err.code, 'corrupted database');
                        assert.strictEqual(err.message, 'file not found');
                    }
                });

                it('should error if database corrupted via corrupted JSON', async function () {
                    const stubs = repo.stubsFor(3000),
                        stub = {
                            predicates: [{ equals: { field: 'request' } }],
                            responses: [
                                { is: { field: 'first-response' } },
                                { is: { field: 'second-response' } }
                            ]
                        },
                        imposter = { port: 3000, stubs: [stub] };

                    await repo.add(imposterize(imposter));
                    const header = read('.mbtest/3000/imposter.json'),
                        stubDir = header.stubs[0].meta.dir,
                        meta = read(`.mbtest/3000/${stubDir}/meta.json`),
                        lastResponseFile = meta.responseFiles[1],
                        responsePath = `.mbtest/3000/${stubDir}/${lastResponseFile}`;

                    fs.writeFileSync(responsePath, 'CORRUPTED');

                    try {
                        await stubs.toJSON();
                        assert.fail('should have errored');
                    }
                    catch (err) {
                        assert.deepEqual(err, {
                            code: 'corrupted database',
                            message: `invalid JSON in ${responsePath}`,
                            details: 'Unexpected token C in JSON at position 0'
                        });
                    }
                });
            });

            describe('#deleteSavedRequests', function () {
                it('should delete the imposter\'s requests/ directory', async function () {
                    const stubs = repo.stubsFor(3000),
                        imposter = { port: 3000, protocol: 'test', stubs: [] };

                    await repo.add(imposterize(imposter));
                    await stubs.addRequest({ field: 'value' });

                    const requestFiles = fs.readdirSync('.mbtest/3000/requests');
                    assert.strictEqual(requestFiles.length, 1);

                    const requests = await stubs.loadRequests();
                    assert.deepEqual(requests, [{ field: 'value', timestamp: requests[0].timestamp }]);

                    await stubs.deleteSavedRequests();
                    const imposterDir = fs.readdirSync('.mbtest/3000');
                    assert.ok(imposterDir.includes('requests') === false);
                });
            });
        });
    });
});
