'use strict';

// Like mocha-as-promised, but more explicit.
// Many times I'd forget to add the errback, making
// tests harder to fix when they failed because I'd
// miss the assertion message.
function wrap (test, that) {
    return done => test.apply(that, []).done(() => { done(); }, done);
}

function promiseIt (what, test) {
    return it(what, wrap(test, { name: what }));
}

promiseIt.only = (what, test) => it.only(what, wrap(test, { name: what }));

module.exports = {
    promiseIt,
    jquery: require('../src/public/scripts/jquery/jquery-3.3.1.min.js')
};
