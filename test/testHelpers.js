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

module.exports = {
    promiseIt: promiseIt,
    jquery: require('../src/public/scripts/jquery/1.11.0/jquery.min.js')
};
