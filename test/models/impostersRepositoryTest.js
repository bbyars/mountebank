'use strict';

const assert = require('assert');

describe('impostersRepository', function () {
    it('exposes raw imposters', function () {
        const imposters = require('../../src/models/impostersRepository').create({});
        assert.deepEqual(imposters.imposters, {});
    });
});
