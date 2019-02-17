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

function isOutOfProcessImposter (protocol) {
    const fs = require('fs');

    if (fs.existsSync('protocols.json')) {
        const protocols = require(process.cwd() + '/protocols.json');
        return Object.keys(protocols).indexOf(protocol) >= 0;
    }
    else {
        return false;
    }
}

function isInProcessImposter (protocol) {
    return !isOutOfProcessImposter(protocol);
}

module.exports = { promiseIt, isOutOfProcessImposter, isInProcessImposter };
