'use strict';

const assert = require('assert'),
    api = require('../api/api').create(),
    JSDOM = require('jsdom').JSDOM,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000);


async function getDOM (endpoint) {
    const url = api.url + endpoint,
        dom = await JSDOM.fromURL(url);
    return dom.window;
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

    // eslint-disable-next-line mocha/no-setup-in-describe
    ['home', 'imposters', 'imposter', 'config', 'logs'].forEach(contractType => {
        it(`${contractType} contract should be valid JSON`, async function () {
            const json = await getJSONFor(contractType);
            assertJSON(json);
        });
    });
});
