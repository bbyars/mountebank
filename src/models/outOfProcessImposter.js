'use strict';

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

module.exports = { createLogger, postJSON };
