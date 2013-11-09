'use strict';

function defer() {
    var resolved = false,
        args = [],
        promise = {
            then: function (successFn, errorFn) {
                if (resolved) {
                    successFn.apply(this, args);
                }
                else {
                    errorFn.apply(this, args);
                }
                return this;
            }
        },
        slice = Array.prototype.slice;

    function resolve() {
        args = slice.call(arguments);
        resolved = true;
    }

    function reject() {
        args = slice.call(arguments);
        resolved = false;
    }

    return {
        promise: promise,
        resolve: resolve,
        reject: reject
    };
}

module.exports = {
    defer: defer
};
