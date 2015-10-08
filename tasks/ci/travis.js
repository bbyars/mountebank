'use strict';

var Q = require('q'),
    https = require('https'),
    apiToken = process.env.TRAVIS_API_TOKEN;

function responseFor (options) {
    if (!apiToken) {
        throw 'TRAVIS_API_TOKEN environment variable must be set';
    }

    var deferred = Q.defer();

    options.hostname = 'api.travis-ci.org';
    options.headers = {
        Authorization: 'token ' + apiToken,
        Accept: 'application/json',
        'Travis-API-Version': 3
    };

    var request = https.request(options, function (response) {
        var packets = [];

        response.on('data', function (data) {
            packets.push(data);
        });

        response.on('end', function () {
            var contentType = response.headers['content-type'] || '';

            response.body = Buffer.concat(packets).toString('utf8');
            if (contentType.indexOf('json') >= 0) {
                response.body = JSON.parse(response.body);
            }
            deferred.resolve(response);
        });
    });

    request.on('error', deferred.reject);

    // Appveyor APIs appear to be deeply sensitive in ways that are deeply hard
    // to comprehend to both the capitalization of some headers (e.g. Authorization)
    // and maybe the ordering of some headers.  This block below fails if put in
    // the options object passed into https.request above.
    if (options.body) {
        options.body = JSON.stringify(options.body);
        request.setHeader('Content-Type', 'application/json');
        request.setHeader('Content-Length', options.body.length);
    }

    if (options.body) {
        request.write(options.body);
    }
    request.end();
    return deferred.promise;
}

function triggerBuild (version) {
    return responseFor({
        method: 'POST',
        path: '/repo/bbyars%2Fmountebank/requests',
        body: {
            request: {
                branch: 'master',
                config: {
                    env: {
                        global: {
                            MB_TEST: 'yes'
                        }
                    }
                }
            }
        }
    }).then(function (response) {
        if (response.statusCode !== 201) {
            console.error('Status code of POST /repo/bbyars%2Fmountebank/requests: ' + response.statusCode);
            throw response.body;
        }

        console.log(response.body);
        return response.body;
    });
}

module.exports = {
    triggerBuild: triggerBuild
};
