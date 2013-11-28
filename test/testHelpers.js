'use strict';

// Like mocha-as-promised, but more explicit.
// Many times I'd forget to add the errback, making
// tests harder to fix when they failed because I'd
// miss the assertion message.
function promiseIt (description, test) {
    var wrappedTest = function (done) {
        test().done(function () { done(); }, done);
    };
    it(description, wrappedTest);
}

module.exports = {
    promiseIt: promiseIt
};
