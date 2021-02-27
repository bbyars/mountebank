'use strict';

const assert = require('assert'),
    w3cjs = require('w3cjs'),
    api = require('../api').create(),
    httpClient = require('../baseHttpClient').create('http');

function assertValid (path, html) {
    return new Promise(resolve => {
        w3cjs.validate({
            input: html,
            callback: (error, response) => {
                if (error) {
                    console.log(`w3cjs error on ${path}`);
                    assert.fail(error);
                }
                const errors = (response.messages || []).filter(message => message.type === 'error'
                ).map(message => ({
                    line: message.lastLine,
                    message: message.message
                }));

                console.log(`Testing ${path}...`);
                assert.strictEqual(0, errors.length,
                    `Errors for ${path}: ${JSON.stringify(errors, null, 2)}`);
                console.log(`...${path} is valid`);
                resolve();
            }
        });
    });
}

function removeKnownErrorsFrom (html) {
    const docsTestFrameworkTags = ['testScenario', 'step', 'volatile', 'assertResponse', 'change'];
    let result = html;

    // ignore errors for webkit attributes on search box
    result = result.replace("results='5' autosave='mb' ", '');

    docsTestFrameworkTags.forEach(tagName => {
        const pattern = `</?${tagName}[^>]*>`,
            regex = new RegExp(pattern, 'g');
        result = result.replace(regex, '');
    });

    return result;
}

async function getHTML (path) {
    const spec = {
        port: api.port,
        method: 'GET',
        path: path,
        headers: { accept: 'text/html' }
    };

    const response = await httpClient.responseFor(spec);
    assert.strictEqual(response.statusCode, 200, `Status code for ${path}: ${response.statusCode}`);

    return removeKnownErrorsFrom(response.body);
}

describe('all pages in the mountebank website', function () {
    this.timeout(60000);

    it('should be valid html', async function () {
        const blacklist = ['/feed', '/logs', '/metrics'],
            response = await api.get('/sitemap');
        assert.strictEqual(response.statusCode, 200);

        const siteLinks = response.body
                .split('\n')
                .map(link => link.replace('http://www.mbtest.org', ''))
                .filter(path => path !== '' && blacklist.indexOf(path) < 0),
            tests = siteLinks.map(async link => {
                const html = await getHTML(link);
                assertValid(link, html);
            });
        return Promise.all(tests);
    });
});
