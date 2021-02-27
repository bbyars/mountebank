'use strict';

const assert = require('assert'),
    api = require('../api').create(),
    httpClient = require('../baseHttpClient').create('http'),
    xpath = require('xpath'),
    DOMParser = require('xmldom').DOMParser,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 3000);

function entryCount (body) {
    const doc = new DOMParser().parseFromString(body),
        select = xpath.useNamespaces({ atom: 'http://www.w3.org/2005/Atom' });
    return select('count(//atom:entry)', doc);
}

function getNextLink (body) {
    const doc = new DOMParser().parseFromString(body),
        select = xpath.useNamespaces({ atom: 'http://www.w3.org/2005/Atom' });
    return select('//atom:link[@rel="next"]/@href', doc)[0].value;
}

describe('the feed', function () {
    this.timeout(timeout);

    it('should default to page 1 with 10 entries', async function () {
        const feedResponse = await httpClient.get('/feed', api.port);
        assert.strictEqual(feedResponse.statusCode, 200);
        assert.strictEqual(feedResponse.headers['content-type'], 'application/atom+xml; charset=utf-8');
        assert.strictEqual(entryCount(feedResponse.body), 10);

        const nextPageResponse = await httpClient.get(getNextLink(feedResponse.body), api.port);
        assert.strictEqual(nextPageResponse.statusCode, 200);
        assert.ok(entryCount(nextPageResponse.body) > 0, 'No entries');
    });
});

