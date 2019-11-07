'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/inMemoryImpostersRepository'),
    promiseIt = require('../testHelpers').promiseIt;

describe('inMemoryImpostersRepository', function () {
    promiseIt('get should return null if no imposter exists', function () {
        const repo = Repo.create();
        return repo.get(1).then(imposter => {
            assert.strictEqual(imposter, null);
        });
    });

    promiseIt('add should allow a reciprocal get', function () {
        const repo = Repo.create();
        return repo.add({ port: 1, value: 2 }).then(() =>
            repo.get(1)
        ).then(imposter => {
            assert.deepEqual(imposter, { port: 1, value: 2 });
        });
    });
});
