'use strict';

const JSDOM = require('jsdom').JSDOM,
    api = require('../api/api').create(),
    Q = require('q'),
    url = require('url'),
    httpClient = require('../api/http/baseHttpClient').create('http'),
    httpsClient = require('../api/http/baseHttpClient').create('https'),
    whitelistPatterns = ['https://s3.amazonaws.com', '^#'];

const isProtocolAgnostic = href => href.indexOf('//') === 0;

const isLocal = href => href.indexOf('/') === 0;

const parseLinksFrom = window => {
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
};

const isExternalPage = baseUrl => baseUrl.indexOf('http://localhost') < 0;

const getLinksFrom = (baseUrl, html) => {
    const deferred = Q.defer();

    if (isExternalPage(baseUrl)) {
        // Don't crawl the internet
        return Q([]);
    }

    try {
        const window = new JSDOM(html).window;
        deferred.resolve(parseLinksFrom(window));
    }
    catch (errors) {
        deferred.reject(errors);
    }

    return deferred.promise;
};

const isWhitelisted = href => whitelistPatterns.some(pattern => new RegExp(pattern, 'i').test(href));

const getResponseFor = href => {
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
};

const isBadLink = href => href.indexOf('http') < 0;

const create = () => {
    const pages = { errors: [], hits: {} };

    const alreadyCrawled = href => pages.hits[href];

    const addReferrer = (href, referrer) => pages.hits[href].from.push(referrer);

    const addError = (href, referrer) => pages.errors.push({ href: href, referrer: referrer });

    const crawl = (startingUrl, referrer) => {
        const serverUrl = startingUrl.replace(/#.*$/, '').trim();

        if (serverUrl === '') {
            return Q(true);
        }
        if (isWhitelisted(serverUrl)) {
            return Q(true);
        }
        else if (isBadLink(serverUrl)) {
            addError(serverUrl, referrer);
            return Q(true);
        }
        else if (alreadyCrawled(serverUrl)) {
            addReferrer(serverUrl, referrer);
            return Q(true);
        }
        else {
            pages.hits[serverUrl] = { from: [referrer] };
            return getResponseFor(serverUrl).then(response => {
                pages.hits[serverUrl].statusCode = response.statusCode;
                pages.hits[serverUrl].contentType = response.headers['content-type'];

                return getLinksFrom(serverUrl, response.body);
            }).then(
                links => Q.all(links.map(link => crawl(link, serverUrl))).then(() => Q(pages)),
                e => { console.log(`ERROR with ${serverUrl}`); console.log(e); });
        }
    };

    return { crawl };
};

module.exports = { create };
