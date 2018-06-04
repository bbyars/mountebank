'use strict';

var JSDOM = require('jsdom').JSDOM,
    api = require('../api/api').create(),
    Q = require('q'),
    url = require('url'),
    httpClient = require('../api/http/baseHttpClient').create('http'),
    httpsClient = require('../api/http/baseHttpClient').create('https'),
    whitelistPatterns = ['https://s3.amazonaws.com', '^#'];

function isProtocolAgnostic (href) {
    return href.indexOf('//') === 0;
}

function isLocal (href) {
    return href.indexOf('/') === 0;
}

function parseLinksFrom (window) {
    var links = [],
        anchorTags = window.document.getElementsByTagName('a');
    for (var i = 0; i < anchorTags.length; i += 1) {
        var href = anchorTags[i].attributes.href ? anchorTags[i].attributes.href.value : null;
        if (href) {
            if (isProtocolAgnostic(href)) {
                href = 'http:' + href;
            }
            if (isLocal(href)) {
                href = 'http://localhost:' + api.port + href;
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
    var deferred = Q.defer();

    if (isExternalPage(baseUrl)) {
        // Don't crawl the internet
        return Q([]);
    }

    try {
        var window = new JSDOM(html).window;
        deferred.resolve(parseLinksFrom(window));
    }
    catch (errors) {
        deferred.reject(errors);
    }

    return deferred.promise;
}

function isWhitelisted (href) {
    return whitelistPatterns.some(function (pattern) {
        return new RegExp(pattern, 'i').test(href);
    });
}

function getResponseFor (href) {
    var parts = url.parse(href),
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
    var pages = { errors: [], hits: {} };

    function alreadyCrawled (href) {
        return pages.hits[href];
    }

    function addReferrer (href, referrer) {
        pages.hits[href].from.push(referrer);
    }

    function addError (href, referrer) {
        pages.errors.push({ href: href, referrer: referrer });
    }

    function crawl (startingUrl, referrer) {
        if (isWhitelisted(startingUrl)) {
            return Q(true);
        }
        else if (isBadLink(startingUrl)) {
            addError(startingUrl, referrer);
            return Q(true);
        }
        else if (alreadyCrawled(startingUrl)) {
            addReferrer(startingUrl, referrer);
            return Q(true);
        }
        else {
            pages.hits[startingUrl] = { from: [referrer] };
            return getResponseFor(startingUrl).then(function (response) {
                pages.hits[startingUrl].statusCode = response.statusCode;
                pages.hits[startingUrl].contentType = response.headers['content-type'];

                return getLinksFrom(startingUrl, response.body);
            }).then(function (links) {
                return Q.all(links.map(function (link) {
                    return crawl(link, startingUrl);
                })).then(function () {
                    return Q(pages);
                });
            });
        }
    }

    return {
        crawl: crawl
    };
}

module.exports = {
    create: create
};
