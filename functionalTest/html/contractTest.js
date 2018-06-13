'use strict';

var assert = require('assert'),
    api = require('../api/api').create(),
    JSDOM = require('jsdom').JSDOM,
    Q = require('q'),
    promiseIt = require('../testHelpers').promiseIt,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000);


function getDOM (endpoint) {
    var deferred = Q.defer(),
        url = api.url + endpoint;

    JSDOM.fromURL(url).then(function (dom) {
        deferred.resolve(dom.window);
    }).catch(function (errors) {
        deferred.reject(errors);
    });

    return deferred.promise;
}

function getJSONFor (contract) {
    return getDOM('/docs/api/contracts').then(function (window) {
        return Q(window.document.getElementById(contract + '-specification').innerHTML.replace(/<[^>]+>/g, ''));
    });
}

function assertJSON (json) {
    try {
        JSON.parse(json);
    }
    catch (e) {
        assert.fail(json + '\n' + e);
    }
}

describe('contracts', function () {
    this.timeout(timeout);
    ['home', 'imposters', 'imposter', 'config', 'logs'].forEach(function (contractType) {
        promiseIt(contractType + ' contract should be valid JSON', function () {
            return getJSONFor(contractType).then(function (json) {
                assertJSON(json);
            });
        });
    });
});
