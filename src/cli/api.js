'use strict';

function curl (options, method, path, body) {
    const Q = require('q'),
        deferred = Q.defer(),
        http = require('http'),
        requestOptions = {
            method: method,
            path: path,
            port: options.port,
            hostname: options.host || 'localhost',
            headers: {
                'Content-Type': 'application/json',
                Connection: 'close'
            }
        },

        request = http.request(requestOptions, response => {
            response.body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { response.body += chunk; });
            response.on('end', () => {
                if (response.statusCode === 200) {
                    response.body = JSON.parse(response.body);
                    deferred.resolve(response);
                }
                else {
                    deferred.reject(new Error(`${response.statusCode}\n${response.body}`));
                }
            });
        });

    request.on('error', deferred.reject);

    if (body) {
        request.write(JSON.stringify(body, null, 2));
    }
    request.end();
    return deferred.promise;
}

function putImposters (options, body) {
    return curl(options, 'PUT', '/imposters', body);
}

function getImposters (options) {
    let path = '/imposters?replayable=true';
    if (options.removeProxies) {
        path += '&removeProxies=true';
    }
    return curl(options, 'GET', path);
}

function logConnectionErrorAndExit (options, err) {
    const host = options.host || 'localhost';
    if (err.code === 'ECONNREFUSED') {
        console.error(`No mb process running on http://${host}:${options.port}`);
    }
    else {
        console.error(err);
    }
    process.exit(1);
}

function loadConfig (options) {
    const formatter = require(options.formatter),
        Q = require('q');

    return Q(formatter.load(options))
        .catch(e => {
            const message = e.code !== 'ENOENT' ? e : `No such file: ${options.configfile}`;
            console.error(message);
            process.exit(1);
        })
        .then(imposters => putImposters(options, imposters))
        .catch(e => logConnectionErrorAndExit(options, e));
}

function save (options) {
    const formatter = require(options.formatter),
        Q = require('q');

    getImposters(options)
        .then(response => Q(formatter.save(options, response.body)))
        .catch(e => logConnectionErrorAndExit(options, e))
        .done();
}

function replay (options) {
    options.removeProxies = true;

    getImposters(options)
        .then(response => putImposters(options, response.body))
        .catch(e => logConnectionErrorAndExit(e, options))
        .done();
}

module.exports = {
    loadConfig,
    save,
    replay
};
