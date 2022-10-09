'use strict';

const errors = require('../util/errors.js'),
    util = require('util');

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
                    message = util.format.apply(this, args);

                console.log(`${level} ${message}`);
            };
        }
    });
    return result;
}

function postJSON (what, where) {
    return new Promise((resolve, reject) => {
        const parts = new URL(where),
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
                        reject(errors.CommunicationError({
                            statusCode: response.statusCode,
                            body: body
                        }));
                    }
                    else {
                        resolve(JSON.parse(body));
                    }
                });
            });

        request.on('error', reject);
        request.write(JSON.stringify(what));
        request.end();
    });
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

    async function getProxyResponse (proxyConfig, request, proxyCallbackURL, requestDetails) {
        const response = await proxy.to(proxyConfig.to, request, proxyConfig, requestDetails);
        return postJSON({ proxyResponse: response }, proxyCallbackURL);
    }

    async function getResponse (request, requestDetails) {
        const mbResponse = await postJSON({ request, requestDetails }, callbackURL);
        if (mbResponse.proxy) {
            return getProxyResponse(mbResponse.proxy, mbResponse.request, mbResponse.callbackURL, requestDetails);
        }
        else if (mbResponse.response) {
            return mbResponse.response;
        }
        else {
            return mbResponse;
        }
    }

    return { getResponse, setPort, setProxy, logger };
}

module.exports = { create };
