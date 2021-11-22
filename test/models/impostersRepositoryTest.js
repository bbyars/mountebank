'use strict';

const assert = require('assert'),
    FakeLogger = require('../fakes/fakeLogger'),
    impostersRepository = require('../../src/models/impostersRepository');

describe('ImpostersRepository', function () {
    describe('#create', function () {
        describe('custom impostersRepository', function () {
            let logger;

            beforeEach(function () {
                logger = FakeLogger.create();
                impostersRepository.inMemory = require('../mock').mock();
            });

            it('should return the custom impostersRepository', function () {
                const config = {
                    impostersRepository: 'test/fakes/fakeImpostersRepository.js'
                };
                assert.deepEqual(impostersRepository.create(config, logger), require('../fakes/fakeImpostersRepository.js').create());
                assert.ok(!impostersRepository.inMemory.wasCalled());
            });

            it('should default to inMemory if the custom impostersRepository does not exist', function () {
                const config = {
                    impostersRepository: '../doesnotexist'
                };
                impostersRepository.create(config, logger);
                assert.ok(impostersRepository.inMemory.wasCalled());
            });
        });
    });
});
