'use strict';

const Q = require('q'),
    helpers = require('../../../src/util/helpers');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const create = protocol => {
    const driver = require(protocol),
        agent = new driver.Agent({ keepAlive: true });

    const optionsFor = spec => {
        const defaults = {
            hostname: 'localhost',
            headers: { accept: 'application/json' },
            rejectUnauthorized: false
        };

        return helpers.merge(defaults, spec);
    };

    const responseFor = spec => {
        const deferred = Q.defer(),
            options = optionsFor(spec);

        if (!options.port) {
            throw Error('silly rabbit, you forgot to pass the port again');
        }

        if (spec.body && !options.headers['Content-Type']) {
            options.headers['Content-Type'] = 'application/json';
        }

        options.agent = agent;
        const request = driver.request(options, response => {
            const packets = [];

            response.on('data', chunk => packets.push(chunk));

            response.on('end', () => {
                const buffer = Buffer.concat(packets),
                    contentType = response.headers['content-type'] || '';

                response.body = spec.mode === 'binary' ? buffer : buffer.toString('utf8');

                if (contentType.indexOf('application/json') === 0) {
                    response.body = JSON.parse(response.body);
                }
                deferred.resolve(response);
            });
        });

        request.on('error', deferred.reject);

        if (spec.body) {
            if (typeof spec.body === 'object') {
                request.write(JSON.stringify(spec.body));
            }
            else {
                request.write(spec.body);
            }
        }
        request.end();
        return deferred.promise;
    };

    const get = (path, port) => responseFor({ method: 'GET', path, port });
    const post = (path, body, port) => responseFor({ method: 'POST', path, port, body });
    const del = (path, port) => responseFor({ method: 'DELETE', path, port });
    const put = (path, body, port) => responseFor({ method: 'PUT', path, port, body });

    return { get, post, del, put, responseFor };
};

module.exports = { create };
