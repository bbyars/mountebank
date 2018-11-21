'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    JSDOM = require('jsdom').JSDOM,
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000);


const getDOM = endpoint => {
    const deferred = Q.defer(),
        url = api.url + endpoint;

    JSDOM.fromURL(url).then(dom => {
        deferred.resolve(dom.window);
    }).catch(errors => {
        deferred.reject(errors);
    });

    return deferred.promise;
};

const getJSONFor = contract =>
    getDOM('/docs/api/contracts').then(window => Q(window.document.getElementById(`${contract}-specification`).innerHTML.replace(/<[^>]+>/g, '')));

const assertJSON = json => {
    try {
        JSON.parse(json);
    }
    catch (e) {
        assert.fail(`${json}\n${e}`);
    }
};

describe('contracts', () => {
    ['home', 'imposters', 'imposter', 'config', 'logs'].forEach(contractType => {
        promiseIt(`${contractType} contract should be valid JSON`, () => getJSONFor(contractType).then(json => {
            assertJSON(json);
        })).timeout(timeout);
    });
});
