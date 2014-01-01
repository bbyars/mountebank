'use strict';

function clone (obj) {
    // Not technically a combinator, but acts like one if you ignore the implementation
    return JSON.parse(JSON.stringify(obj));
}

function merge (defaults, overrides) {
    var result = clone(defaults);
    Object.keys(overrides).forEach(function (key) {
        if (typeof overrides[key] === 'object') {
            result[key] = merge(result[key] || {}, overrides[key]);
        }
        else {
            result[key] = overrides[key];
        }
    });
    return result;
}

module.exports = {
    identity: function (i) { return i; },
    constant: function (k) { return function () { return k; }; },
    noop: function () {},
    clone: clone,
    merge: merge
};
