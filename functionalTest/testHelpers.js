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

function runningLocally () {
    var path = require('path'),
        fs = require('fs');

    return fs.existsSync(path.join(__dirname, '../src'));
}

// Allow loading a module from the source directory even when we're testing a
// distribution rather than a checkout from git (which is how CircleCI runs)
function fromSrc (modulePath) {
    var path = require('path');

    if (runningLocally()) {
        return path.join(__dirname, '../src', modulePath);
    }
    else {
        return path.join(__dirname, '../dist/mountebank/src', modulePath);
    }
}

module.exports = {
    promiseIt: promiseIt,
    fromSrc: fromSrc
};
