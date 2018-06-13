'use strict';

// Like mocha-as-promised, but more explicit.
// Many times I'd forget to add the errback, making
// tests harder to fix when they failed because I'd
// miss the assertion message.
function wrap (test, that) {
    return function (done) {
        test.apply(that, []).done(function () { done(); }, done);
    };
}

function promiseIt (what, test) {
    it(what, wrap(test, { name: what }));
}

promiseIt.only = function (what, test) {
    it.only(what, wrap(test, { name: what }));
};

// Allow loading a module from the source directory even when we're testing a
// distribution rather than a checkout from git
function fromSrc (modulePath) {
    var path = require('path'),
        mbPath = process.env.MB_EXECUTABLE || path.join(__dirname, '/../bin/mb');

    return path.join(path.dirname(mbPath), '../src', modulePath);
}

module.exports = {
    promiseIt: promiseIt,
    fromSrc: fromSrc
};
