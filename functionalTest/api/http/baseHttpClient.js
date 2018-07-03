'use strict';

var Q = require('q'),
    helpers = require('../../../src/util/helpers'),
    agents = {
        http: new require('http').Agent({ keepAlive: true }),
        https: new require('https').Agent({ keepAlive: true })
    };

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function create (protocol) {
    var driver = require(protocol),
        agent = agents[protocol];

    function optionsFor (spec) {
        var defaults = {
            hostname: 'localhost',
            headers: { accept: 'application/json' },
            rejectUnauthorized: false
        };

        return helpers.merge(defaults, spec);
    }

    function responseFor (spec) {
        var deferred = Q.defer(),
            options = optionsFor(spec);

        if (!options.port) {
            throw Error('silly rabbit, you forgot to pass the port again');
        }

        if (spec.body && !options.headers['Content-Type']) {
            options.headers['Content-Type'] = 'application/json';
        }

        options.agent = agent;
        var request = driver.request(options, function (response) {
            var packets = [];

            response.on('data', function (chunk) {
                packets.push(chunk);
            });

            response.once('end', function () {
                var buffer = Buffer.concat(packets),
                    contentType = response.headers['content-type'] || '';

                response.body = spec.mode === 'binary' ? buffer : buffer.toString('utf8');

                if (contentType.indexOf('application/json') === 0) {
                    response.body = JSON.parse(response.body);
                }
                agent.destroy();
                deferred.resolve(response);
            });
        });

        request.once('error', err => {
            agent.destroy();
            deferred.reject(err);
        });

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
    }

    function get (path, port) {
        return responseFor({ method: 'GET', path: path, port: port });
    }

    function post (path, body, port) {
        return responseFor({ method: 'POST', path: path, port: port, body: body });
    }

    function del (path, port) {
        return responseFor({ method: 'DELETE', path: path, port: port });
    }

    function put (path, body, port) {
        return responseFor({ method: 'PUT', path: path, port: port, body: body });
    }

    return {
        get: get,
        post: post,
        del: del,
        put: put,
        responseFor: responseFor
    };
}

module.exports = {
    create: create
};
