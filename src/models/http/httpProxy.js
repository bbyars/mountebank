'use strict';

/**
 * The proxy implementation for http/s imposters
 * @module
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * Creates the proxy
 * @param {Object} logger - The logger
 * @returns {Object}
 */
function create (logger) {
    function toUrl (path, query) {
        var querystring = require('querystring'),
            tail = querystring.stringify(query);

        if (tail === '') {
            return path;
        }
        return path + '?' + tail;
    }

    function hostnameFor (protocol, host, port) {
        var result = host;
        if ((protocol === 'http:' && port !== 80) || (protocol === 'https:' && port !== 443)) {
            result += ':' + port;
        }
        return result;
    }

    function setProxyAgent (parts, options) {
        var HttpProxyAgent = require('http-proxy-agent'),
            HttpsProxyAgent = require('https-proxy-agent');

        if (process.env.http_proxy && parts.protocol === 'http:') {
            options.agent = new HttpProxyAgent(process.env.http_proxy);
        }
        else if (process.env.https_proxy && parts.protocol === 'https:') {
            options.agent = new HttpsProxyAgent(process.env.https_proxy);
        }
    }

    function getProxyRequest (baseUrl, originalRequest, proxyOptions) {
        var helpers = require('../../util/helpers'),
            headersHelper = require('./headersHelper'),
            url = require('url'),
            parts = url.parse(baseUrl),
            protocol = parts.protocol === 'https:' ? require('https') : require('http'),
            defaultPort = parts.protocol === 'https:' ? 443 : 80,
            options = {
                method: originalRequest.method,
                hostname: parts.hostname,
                port: parts.port || defaultPort,
                auth: parts.auth,
                path: toUrl(originalRequest.path, originalRequest.query),
                headers: helpers.clone(originalRequest.headers),
                cert: proxyOptions.cert,
                key: proxyOptions.key,
                ciphers: proxyOptions.ciphers || 'ALL',
                rejectUnauthorized: false
            };
        options.headers.host = hostnameFor(parts.protocol, parts.hostname, options.port);
        setProxyAgent(parts, options);

        // Avoid implicit chunked encoding (issue #132)
        if (originalRequest.body &&
            !headersHelper.hasHeader('Transfer-Encoding', originalRequest.headers) &&
            !headersHelper.hasHeader('Content-Length', originalRequest.headers)) {
            options.headers['Content-Length'] = Buffer.byteLength(originalRequest.body);
        }

        var proxiedRequest = protocol.request(options);
        if (originalRequest.body) {
            proxiedRequest.write(originalRequest.body);
        }
        return proxiedRequest;
    }

    function isBinaryResponse (headers) {
        var contentEncoding = headers['content-encoding'] || '',
            contentType = headers['content-type'] || '';

        if (contentEncoding.indexOf('gzip') >= 0) {
            return true;
        }

        if (contentType === 'application/octet-stream') {
            return true;
        }

        return ['audio', 'image', 'video'].some(function (typeName) {
            return contentType.indexOf(typeName) === 0;
        });
    }

    function proxy (proxiedRequest) {
        var Q = require('q'),
            deferred = Q.defer(),
            start = new Date();

        proxiedRequest.end();

        proxiedRequest.once('response', function (response) {
            var packets = [];

            response.on('data', function (chunk) {
                packets.push(chunk);
            });

            response.on('end', function () {
                var body = Buffer.concat(packets),
                    mode = isBinaryResponse(response.headers) ? 'binary' : 'text',
                    encoding = mode === 'binary' ? 'base64' : 'utf8',
                    headersHelper = require('./headersHelper'),
                    stubResponse = {
                        statusCode: response.statusCode,
                        headers: headersHelper.headersFor(response.rawHeaders),
                        body: body.toString(encoding),
                        _mode: mode,
                        _proxyResponseTime: new Date() - start
                    };
                deferred.resolve(stubResponse);
            });
        });

        return deferred.promise;
    }

    /**
     * Proxies an http/s request to a destination
     * @memberOf module:models/http/httpProxy#
     * @param {string} proxyDestination - The base URL to proxy to, without a path (e.g. http://www.google.com)
     * @param {Object} originalRequest - The original http/s request to forward on to proxyDestination
     * @param {Object} options - Proxy options
     * @param {string} [options.cert] - The certificate, in case the destination requires mutual authentication
     * @param {string} [options.key] - The private key, in case the destination requires mutual authentication
     * @returns {Object} - Promise resolving to the response
     */
    function to (proxyDestination, originalRequest, options) {

        function log (direction, what) {
            logger.debug('Proxy %s %s %s %s %s',
                originalRequest.requestFrom, direction, JSON.stringify(what), direction, proxyDestination);
        }

        var Q = require('q'),
            deferred = Q.defer(),
            proxiedRequest = getProxyRequest(proxyDestination, originalRequest, options);

        log('=>', originalRequest);

        proxy(proxiedRequest).done(function (response) {
            log('<=', response);
            deferred.resolve(response);
        });

        proxiedRequest.once('error', function (error) {
            var errors = require('../../util/errors');

            if (error.code === 'ENOTFOUND') {
                deferred.reject(errors.InvalidProxyError('Cannot resolve ' + JSON.stringify(proxyDestination)));
            }
            else if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
                deferred.reject(errors.InvalidProxyError('Unable to connect to ' + JSON.stringify(proxyDestination)));
            }
            else {
                deferred.reject(error);
            }
        });

        return deferred.promise;
    }

    return {
        to: to
    };
}

module.exports = {
    create: create
};
