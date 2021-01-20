'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    JSDOM = require('jsdom').JSDOM,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000);


function getDOM (endpoint) {
    const url = api.url + endpoint;

    return new Promise((resolve, reject) => {
        JSDOM.fromURL(url).then(dom => {
            resolve(dom.window);
        }).catch(errors => {
            reject(errors);
        });
    });
}

async function getJSONFor (contract) {
    const window = await getDOM('/docs/api/contracts');
    return window.document.getElementById(`${contract}-specification`).innerHTML.replace(/<[^>]+>/g, '');
}

function assertJSON (json) {
    try {
        JSON.parse(json);
    }
    catch (e) {
        assert.fail(`${json}\n${e}`);
    }
}

describe('contracts', function () {
    this.timeout(timeout);

    ['home', 'imposters', 'imposter', 'config', 'logs'].forEach(contractType => {
        it(`${contractType} contract should be valid JSON`, async function () {
            const json = await getJSONFor(contractType);
            assertJSON(json);
        });
    });
});
