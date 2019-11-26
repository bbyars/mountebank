'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/filesystemBackedStubRepository'),
    fs = require('fs-extra'),
    cwd = require('process').cwd(),
    promiseIt = require('../testHelpers').promiseIt;

describe('filesystemBackedStubRepository', function () {
    beforeEach(function () {
        fs.ensureDirSync('.mbtest/3000');
    });

    afterEach(function () {
        fs.removeSync('.mbtest');
    });

    describe('#add', function () {
        promiseIt('should create stub files if first stub to be added', function () {
            const repo = Repo.create({ imposterDir: '.mbtest/3000' }),
                stub = {
                    predicates: [{ equals: { field: 'request' } }],
                    responses: [{ is: { field: 'response' } }]
                },
                header = { port: 3000, protocol: 'test' };
            fs.writeFileSync('.mbtest/3000/header.json', JSON.stringify(header));

            return repo.add(stub).then(() => {
                const imposterHeader = require(`${cwd}/.mbtest/3000/header.json`);
                assert.deepEqual(imposterHeader, {
                    port: 3000,
                    protocol: 'test',
                    stubs: {
                        batchSize: 100,
                        dirs: ['stubs/0.json']
                    }
                });

                const stubs = require(`${cwd}/.mbtest/3000/stubs/0.json`);
                assert.deepEqual(stubs, {
                    stubs: [{
                        predicates: [{ equals: { field: 'request' } }],
                        responseDirs: ['responses/0.json'],
                        orderWithRepeats: [0],
                        nextIndex: 0
                    }]
                });

                const response = require(`${cwd}/.mbtest/3000/stubs/0/responses/0.json`);
                assert.deepEqual(response, { is: { field: 'response' } });
            });
        });
    });
});
