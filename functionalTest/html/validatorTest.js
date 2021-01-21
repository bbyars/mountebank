'use strict';

const assert = require('assert'),
    w3cjs = require('w3cjs'),
    api = require('../api/api').create(),
    httpClient = require('../api/http/baseHttpClient').create('http'),
    currentVersion = require('../../package.json').version;

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

// MB_AIRPLANE_MODE because these require network access
// MB_RUN_WEB_TESTS because these are slow, occasionally fragile, and there's
// no value running them with every node in the build matrix
if (process.env.MB_AIRPLANE_MODE !== 'true' && process.env.MB_RUN_WEB_TESTS === 'true' && process.env.MB_COMMENT === 'true') {
    describe('all pages in the mountebank website', function () {
        this.timeout(60000);

        it('should be valid html', async function () {
            // feed isn't html and is tested elsewhere; support has non-valid Google HTML embedded
            const blacklist = ['/feed', '/support', '/imposters', '/logs'];

            const response = await api.get('/sitemap');
            assert.strictEqual(response.statusCode, 200);

            const siteLinks = response.body
                    .split('\n')
                    .map(link => link.replace('http://www.mbtest.org', ''))
                    .filter(path =>
                        // save time by only checking latest releases, others should be immutable
                        path !== '' &&
                        blacklist.indexOf(path) < 0 &&
                        (path.indexOf('/releases/') < 0 || path.indexOf(currentVersion) > 0)
                    ),
                tests = siteLinks.map(async link => {
                    const html = await getHTML(link);
                    assertValid(link, html);
                });
            return Promise.all(tests);
        });
    });
}
