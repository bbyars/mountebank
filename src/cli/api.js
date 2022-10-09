'use strict';

const http = require('http');

function curl (options, method, path, body) {
    return new Promise((resolve, reject) => {
        const requestOptions = {
            method: method,
            path: path,
            port: options.port,
            hostname: options.host || 'localhost',
            headers: {
                'Content-Type': 'application/json',
                Connection: 'close'
            }
        };

        if (options.apikey) {
            requestOptions.headers['x-api-key'] = options.apikey;
        }

        const request = http.request(requestOptions, response => {
            response.body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { response.body += chunk; });
            response.on('end', () => {
                if (response.statusCode === 200) {
                    response.body = JSON.parse(response.body);
                    resolve(response);
                }
                else {
                    reject(new Error(`${response.statusCode}\n${response.body}`));
                }
            });
        });

        request.on('error', reject);

        if (body) {
            request.write(JSON.stringify(body, null, 2));
        }
        request.end();
    });
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
    if (err.code === 'ENOENT') {
        console.error(`No such file: ${options.configfile}`);
    }
    if (err.code === 'ECONNREFUSED') {
        console.error(`No mb process running on http://${host}:${options.port}`);
    }
    else {
        console.error(err);
    }
    process.exit(1); // eslint-disable-line no-process-exit
}

async function loadConfig (options) {
    const formatter = require(options.formatter);

    try {
        const imposters = await formatter.load(options);
        await putImposters(options, imposters);
    }
    catch (e) {
        logConnectionErrorAndExit(options, e);
    }
}

async function save (options) {
    const formatter = require(options.formatter);

    try {
        const response = await getImposters(options);
        await formatter.save(options, response.body);
    }
    catch (e) {
        logConnectionErrorAndExit(options, e);
    }
}

async function replay (options) {
    options.removeProxies = true;

    try {
        const response = await getImposters(options);
        await putImposters(options, response.body);
    }
    catch (e) {
        logConnectionErrorAndExit(e, options);
    }
}

module.exports = {
    loadConfig,
    save,
    replay
};
