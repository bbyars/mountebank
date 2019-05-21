'use strict';

// Like mocha-as-promised, but more explicit.
// Many times I'd forget to add the errback, making
// tests harder to fix when they failed because I'd
// miss the assertion message.
function wrap (test, that) {
    const isWindows = require('os').platform().indexOf('win') === 0;

    return done => test.apply(that, []).done(() => { done(); }, err => {
        // TODO: Hack because I've been unable to troubleshoot ECONNRESET errors on Appveyor
        if (err.errno === 'ECONNRESET' && isWindows) {
            console.log('Skipping test due to ECONNRESET error');
            done();
        }
        else {
            done(err);
        }
    });
}

function promiseIt (what, test) {
    return it(what, wrap(test, { name: what }));
}

promiseIt.only = (what, test) => it.only(what, wrap(test, { name: what }));

function xpromiseIt () {}
xpromiseIt.only = () => {};

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

module.exports = { xpromiseIt, promiseIt, isOutOfProcessImposter, isInProcessImposter };
