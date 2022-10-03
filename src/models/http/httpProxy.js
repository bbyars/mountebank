'use strict';

/**
 * The proxy implementation for http/s imposters
 * @module
 */

const https = require('https'),
    http = require('http'),
    queryString = require('querystring'),
    HttpProxyAgent = require('http-proxy-agent'),
    HttpsProxyAgent = require('https-proxy-agent'),
    helpers = require('../../util/helpers.js'),
    headersMap = require('./headersMap.js'),
    errors = require('../../util/errors.js');


process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * Creates the proxy
 * @param {Object} logger - The logger
 * @returns {Object}
 */
function create (logger) {
    const BINARY_CONTENT_ENCODINGS = [
        'gzip', 'br', 'compress', 'deflate'
    ];
    const BINARY_MIME_TYPES = [
        'audio/',
        'application/epub+zip',
        'application/gzip',
        'application/java-archive',
        'application/msword',
        'application/octet-stream',
        'application/pdf',
        'application/rtf',
        'application/vnd.ms-excel',
        'application/vnd.ms-fontobject',
        'application/vnd.ms-powerpoint',
        'application/vnd.visio',
        'application/x-shockwave-flash',
        'application/x-tar',
        'application/zip',
        'font/',
        'image/',
        'model/',
        'video/'
    ];

    function addInjectedHeadersTo (request, headersToInject) {
        Object.keys(headersToInject || {}).forEach(key => {
            request.headers[key] = headersToInject[key];
        });
    }

    function toUrl (path, query, requestDetails) {
        if (requestDetails) {
            // Not passed in outOfProcess mode
            return requestDetails.rawUrl;
        }

        const tail = queryString.stringify(query);

        if (tail === '') {
            return path;
        }
        return `${path}?${tail}`;
    }

    function hostnameFor (protocol, host, port) {
        let result = host;
        if ((protocol === 'http:' && port !== 80) || (protocol === 'https:' && port !== 443)) {
            result += `:${port}`;
        }
        return result;
    }

    function setProxyAgent (parts, options) {


        if (process.env.http_proxy && parts.protocol === 'http:') {
            options.agent = new HttpProxyAgent(process.env.http_proxy);
        }
        else if (process.env.https_proxy && parts.protocol === 'https:') {
            options.agent = new HttpsProxyAgent(process.env.https_proxy);
        }
    }

    function getProxyRequest (baseUrl, originalRequest, proxyOptions, requestDetails) {
        /* eslint complexity: 0 */
        const parts = new URL(baseUrl),
            protocol = parts.protocol === 'https:' ? https : http,
            defaultPort = parts.protocol === 'https:' ? 443 : 80,
            options = {
                method: originalRequest.method,
                hostname: parts.hostname,
                port: parts.port || defaultPort,
                auth: parts.auth,
                path: toUrl(originalRequest.path, originalRequest.query, requestDetails),
                headers: helpers.clone(originalRequest.headers),
                cert: proxyOptions.cert,
                key: proxyOptions.key,
                ciphers: proxyOptions.ciphers || 'ALL',
                secureProtocol: proxyOptions.secureProtocol,
                passphrase: proxyOptions.passphrase,
                rejectUnauthorized: false
            };

        // Only set host header if not overridden via injectHeaders (issue #388)
        if (!proxyOptions.injectHeaders || !headersMap.of(proxyOptions.injectHeaders).has('host')) {
            options.headers.host = hostnameFor(parts.protocol, parts.hostname, options.port);
        }
        setProxyAgent(parts, options);

        // Avoid implicit chunked encoding (issue #132)
        if (originalRequest.body &&
            !headersMap.of(originalRequest.headers).has('Transfer-Encoding') &&
            !headersMap.of(originalRequest.headers).has('Content-Length')) {
            options.headers['Content-Length'] = Buffer.byteLength(originalRequest.body);
        }

        const proxiedRequest = protocol.request(options);
        if (originalRequest.body) {
            proxiedRequest.write(originalRequest.body);
        }
        return proxiedRequest;
    }

    function isBinaryResponse (headers) {
        const contentEncoding = headers['content-encoding'] || '',
            contentType = headers['content-type'] || '';

        if (BINARY_CONTENT_ENCODINGS.some(binEncoding => contentEncoding.indexOf(binEncoding) >= 0)) {
            return true;
        }

        return BINARY_MIME_TYPES.some(typeName => contentType.indexOf(typeName) >= 0);
    }

    function maybeJSON (text) {
        try {
            return JSON.parse(text);
        }
        catch {
            return text;
        }
    }

    function proxy (proxiedRequest) {
        return new Promise(resolve => {
            proxiedRequest.end();

            proxiedRequest.once('response', response => {
                const packets = [];

                response.on('data', chunk => {
                    packets.push(chunk);
                });

                response.on('end', () => {
                    const body = Buffer.concat(packets),
                        mode = isBinaryResponse(response.headers) ? 'binary' : 'text',
                        encoding = mode === 'binary' ? 'base64' : 'utf8',
                        stubResponse = {
                            statusCode: response.statusCode,
                            headers: headersMap.ofRaw(response.rawHeaders).all(),
                            body: maybeJSON(body.toString(encoding)),
                            _mode: mode
                        };
                    resolve(stubResponse);
                });
            });
        });
    }

    /**
     * Proxies an http/s request to a destination
     * @memberOf module:models/http/httpProxy#
     * @param {string} proxyDestination - The base URL to proxy to, without a path (e.g. http://www.google.com)
     * @param {Object} originalRequest - The original http/s request to forward on to proxyDestination
     * @param {Object} options - Proxy options
     * @param {string} [options.cert] - The certificate, in case the destination requires mutual authentication
     * @param {string} [options.key] - The private key, in case the destination requires mutual authentication
     * @param {Object} [options.injectHeaders] - The headers to inject in the proxied request
     * @param {Object} [options.passphrase] - The passphrase for the private key
     * @param {Object} requestDetails - Additional details about the request not stored in the simplified JSON
     * @returns {Object} - Promise resolving to the response
     */
    function to (proxyDestination, originalRequest, options, requestDetails) {

        addInjectedHeadersTo(originalRequest, options.injectHeaders);

        function log (direction, what) {
            logger.debug('Proxy %s %s %s %s %s',
                originalRequest.requestFrom, direction, JSON.stringify(what), direction, proxyDestination);
        }

        return new Promise((resolve, reject) => {
            let proxiedRequest;
            try {
                proxiedRequest = getProxyRequest(proxyDestination, originalRequest, options, requestDetails);
            }
            catch (e) {
                reject(errors.InvalidProxyError(`Unable to connect to ${JSON.stringify(proxyDestination)}`));
            }

            log('=>', originalRequest);

            proxiedRequest.once('error', error => {
                if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
                    reject(errors.InvalidProxyError(`Cannot resolve ${JSON.stringify(proxyDestination)}`));
                }
                else if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
                    reject(errors.InvalidProxyError(`Unable to connect to ${JSON.stringify(proxyDestination)}`));
                }
                else {
                    reject(error);
                }
            });

            proxy(proxiedRequest).then(response => {
                log('<=', response);
                resolve(response);
            });
        });
    }

    return { to };
}

module.exports = { create };
