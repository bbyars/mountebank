'use strict';

// Like mocha-as-promised, but more explicit.
// Many times I'd forget to add the errback, making
// tests harder to fix when they failed because I'd
// miss the assertion message.
function wrap (test) {
    return function (done) {
        test().done(function () { done(); }, done);
    };
}

function promiseIt (description, test) {
    it(description, wrap(test));
}

promiseIt.only = function (description, test) {
    it.only(description, wrap(test));
};

module.exports = {
    promiseIt: promiseIt
};
