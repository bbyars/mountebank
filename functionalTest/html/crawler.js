'use strict';

const JSDOM = require('jsdom').JSDOM,
    api = require('../api/api').create(),
    url = require('url'),
    httpClient = require('../api/http/baseHttpClient').create('http'),
    httpsClient = require('../api/http/baseHttpClient').create('https'),
    whitelistPatterns = ['https://s3.amazonaws.com', '^#', 'http://mbtest.org/feed'];

function isProtocolAgnostic (href) {
    return href.indexOf('//') === 0;
}

function isLocal (href) {
    return href.indexOf('/') === 0;
}

function parseLinksFrom (window) {
    const links = [],
        anchorTags = window.document.getElementsByTagName('a');
    for (let i = 0; i < anchorTags.length; i += 1) {
        let href = anchorTags[i].attributes.href ? anchorTags[i].attributes.href.value : null;
        if (href) {
            if (isProtocolAgnostic(href)) {
                href = `http:${href}`;
            }
            if (isLocal(href)) {
                href = `http://localhost:${api.port}${href}`;
            }
            links.push(href);
        }
    }
    return links;
}

function isExternalPage (baseUrl) {
    return baseUrl.indexOf('http://localhost') < 0;
}

function getLinksFrom (baseUrl, html) {
    return new Promise((resolve, reject) => {
        if (isExternalPage(baseUrl)) {
            // Don't crawl the internet
            resolve([]);
        }

        try {
            const window = new JSDOM(html).window;
            resolve(parseLinksFrom(window));
        }
        catch (errors) {
            reject(errors);
        }
    });
}

function isWhitelisted (href) {
    return whitelistPatterns.some(pattern => new RegExp(pattern, 'i').test(href));
}

function getResponseFor (href) {
    const parts = url.parse(href),
        client = parts.protocol === 'https:' ? httpsClient : httpClient,
        defaultPort = parts.protocol === 'https:' ? 443 : 80,
        spec = {
            hostname: parts.hostname,
            port: parts.port || defaultPort,
            method: 'GET',
            path: parts.path,
            headers: { accept: 'text/html' }
        };

    return client.responseFor(spec);
}

function isBadLink (href) {
    return href.indexOf('http') < 0;
}

function create () {
    const pages = { errors: [], hits: {} };

    function alreadyCrawled (href) {
        return pages.hits[href];
    }

    function addReferrer (href, referrer) {
        return pages.hits[href].from.push(referrer);
    }

    function addError (href, referrer) {
        return pages.errors.push({ href: href, referrer: referrer });
    }

    async function crawl (startingUrl, referrer) {
        const serverUrl = startingUrl.replace(/#.*$/, '').trim();

        if (serverUrl === '') {
            return true;
        }
        if (isWhitelisted(serverUrl)) {
            return true;
        }
        else if (isBadLink(serverUrl)) {
            addError(serverUrl, referrer);
            return true;
        }
        else if (alreadyCrawled(serverUrl)) {
            addReferrer(serverUrl, referrer);
            return true;
        }
        else {
            try {
                pages.hits[serverUrl] = { from: [referrer] };
                const response = await getResponseFor(serverUrl);
                pages.hits[serverUrl].statusCode = response.statusCode;
                pages.hits[serverUrl].contentType = response.headers['content-type'];

                const links = await getLinksFrom(serverUrl, response.body);
                await Promise.all(links.map(link => crawl(link, serverUrl)));
                return pages;
            }
            catch (e) {
                console.log(`ERROR with ${serverUrl}`); console.log(e);
                return false;
            }
        }
    }

    return { crawl };
}

module.exports = { create };
