'use strict';

const assert = require('assert'),
    Repo = require('../../src/models/inMemoryImpostersRepository'),
    promiseIt = require('../testHelpers').promiseIt;

describe('inMemoryImpostersRepository', function () {
    it('get should return undefined if no imposter exists', function () {
        const repo = Repo.create();
        assert.strictEqual(typeof repo.get(1), 'undefined');
    });

    promiseIt('add should allow a reciprocal get', function () {
        const repo = Repo.create();
        return repo.add({ port: 1, value: 2 }).then(() => {
            assert.deepEqual(repo.get(1), { port: 1, value: 2 });
        });
    });
});
