'use strict';

var assert = require('assert'),
    WSDL = require('../../../src/models/soap/wsdl'),
    promiseIt = require('../../testHelpers').promiseIt;

describe('WSDL', function () {
    describe('#parse', function () {
        it('is empty when nothing is passed in', function () {
            assert.ok(WSDL.parse(undefined).isEmpty());
        });

        it('is not empty when something is passed in', function () {
            assert.ok(!WSDL.parse('wsdl').isEmpty());
        })
    });
});
