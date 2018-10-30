'use strict';

const Q = require('q'),
    https = require('https'),
    apiToken = process.env.TRAVIS_API_TOKEN;

const responseFor = options => {
    if (!apiToken) {
        throw new Error('TRAVIS_API_TOKEN environment variable must be set');
    }

    const deferred = Q.defer();

    options.hostname = 'api.travis-ci.org';
    options.headers = options.headers || {};
    options.headers.Authorization = `token${apiToken}`;
    options.headers.Accept = 'application/vnd.travis-ci.2+json';

    const request = https.request(options, response => {
        const packets = [];

        response.on('data', data => {
            packets.push(data);
        });

        response.on('end', () => {
            const contentType = response.headers['content-type'] || '';

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
};

const triggerBuild = version => responseFor({
    method: 'POST',
    path: '/repo/bbyars%2Fmountebank/requests',
    headers: {
        'Travis-API-Version': 3
    },
    body: {
        request: {
            branch: 'master',
            config: {
                env: {
                    global: {
                        MB_TEST: 'yes',
                        MB_VERSION: version
                    }
                }
            }
        }
    }
}).then(response => {
    if (response.statusCode !== 201 && response.statusCode !== 202) {
        console.error(`Status code of POST /repo/bbyars%2Fmountebank/requests: ${response.statusCode}`);
        throw response.body;
    }

    return responseFor({
        method: 'GET',
        path: '/repos/bbyars/mountebank/builds'
    });
}).then(response => {
    if (response.statusCode !== 200) {
        console.error(`Status code of GET /repos/bbyars/mountebank/builds: ${response.statusCode}`);
        throw response.body;
    }

    // Total hack.  As far as I can tell, Travis doesn't give us a way to get the number of the
    // build we just triggered, and calling /repos/bbyars/mountebank/builds immediately after
    // does not yet show it.  I'm assuming it will be the next number, and in a few seconds it
    // will start to show up in the /repos/bbyars/mountebank/builds call
    return parseInt(response.body.builds[0].number) + 1;
});

const getBuildStatus = buildNumber => responseFor({
    method: 'GET',
    path: `/repos/bbyars/mountebank/builds?number=${buildNumber}`
}).then(response => {
    if (response.statusCode !== 200) {
        console.error(`Status code of GET /repos/bbyars/mountebank/builds?number=${buildNumber}: ${response.statusCode}`);
        throw response.body;
    }

    return (response.body.builds.length === 0) ? 'pending' : response.body.builds[0].state;
});

module.exports = { triggerBuild, getBuildStatus };
