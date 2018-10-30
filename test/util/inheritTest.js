'use strict';

const assert = require('assert'),
    inherit = require('../../src/util/inherit');

describe('inherit', () => {
    describe('#from', () => {
        it('should inherit prototype', () => {
            const obj = inherit.from({ prototypeKey: 'prototypeValue' });
            assert.strictEqual(obj.prototypeKey, 'prototypeValue');
        });

        it('should have both new keys and prototype keys', () => {
            const obj = inherit.from({ prototypeKey: 'prototypeValue' }, { ownKey: 'ownValue' });
            assert.strictEqual(obj.prototypeKey, 'prototypeValue');
            assert.strictEqual(obj.ownKey, 'ownValue');
        });

        it('should shadow prototype with own keys', () => {
            const obj = inherit.from({ key: 'prototypeValue' }, { key: 'ownValue' });
            assert.strictEqual(obj.key, 'ownValue');
        });

        it('should call new on function supers', () => {
            function F () {
                this.key = 'value';
            }

            const obj = inherit.from(F);

            assert.strictEqual(obj.key, 'value');
        });
    });
});
