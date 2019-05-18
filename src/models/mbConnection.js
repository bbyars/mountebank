'use strict';

/**
 * Helper functions to navigate the mountebank API for out of process implementations.
 * Used to adapt the built-in (in-process) protocols to out of process.
 * @module
 */

function createLogger (loglevel) {
    const result = {},
        levels = ['debug', 'info', 'warn', 'error'];

    levels.forEach((level, index) => {
        if (index < levels.indexOf(loglevel)) {
            result[level] = () => {};
        }
        else {
            result[level] = function () {
                const args = Array.prototype.slice.call(arguments),
                    message = require('util').format.apply(this, args);

                console.log(`${level} ${message}`);
            };
        }
    });
    return result;
}

function postJSON (what, where) {
    const Q = require('q'),
        deferred = Q.defer(),
        url = require('url'),
        parts = url.parse(where),
        driver = require(parts.protocol.replace(':', '')),
        options = {
            hostname: parts.hostname,
            port: parts.port,
            path: parts.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        },
        request = driver.request(options, response => {
            const packets = [];

            response.on('data', chunk => packets.push(chunk));

            response.on('end', () => {
                const buffer = Buffer.concat(packets),
                    body = buffer.toString('utf8');

                if (response.statusCode !== 200) {
                    deferred.reject(require('../../util/errors').CommunicationError({
                        statusCode: response.statusCode,
                        body: body
                    }));
                }
                else {
                    deferred.resolve(JSON.parse(body));
                }
            });
        });

    request.on('error', deferred.reject);
    request.write(JSON.stringify(what));
    request.end();
    return deferred.promise;
}

function create (config) {
    let callbackURL,
        proxy;

    function setPort (port) {
        callbackURL = config.callbackURLTemplate.replace(':port', port);
    }

    function setProxy (value) {
        proxy = value;
    }

    function logger () {
        return createLogger(config.loglevel);
    }

    function getProxyResponse (proxyConfig, request, proxyCallbackURL) {
        return proxy.to(proxyConfig.to, request, proxyConfig)
            .then(response => postJSON({ proxyResponse: response }, proxyCallbackURL));
    }

    function getResponse (request, requestDetails) {
        const Q = require('q');

        return postJSON({ request, requestDetails }, callbackURL).then(mbResponse => {
            if (mbResponse.proxy) {
                return getProxyResponse(mbResponse.proxy, mbResponse.request, mbResponse.callbackURL);
            }
            else if (mbResponse.response) {
                return Q(mbResponse.response);
            }
            else {
                return Q(mbResponse);
            }
        });
    }

    return { getResponse, setPort, setProxy, logger };
}

module.exports = { create };
