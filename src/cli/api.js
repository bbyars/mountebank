'use strict';

const fs = require('fs-extra'),
    path = require('path'),
    http = require('http'),
    Q = require('q'),
    ejs = require('ejs');

function shouldLoadConfigFile (options) {
    return typeof options.configfile !== 'undefined';
}

function putConfig (options, body) {
    const deferred = Q.defer(),
        requestOptions = {
            method: 'PUT',
            path: '/imposters',
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
                response.body = JSON.parse(response.body);
                deferred.resolve(response);
            });
        });

    request.on('error', deferred.reject);

    request.write(body);
    request.end();
    return deferred.promise;
}

function getConfig (options) {
    const deferred = Q.defer(),
        requestOptions = {
            method: 'GET',
            path: '/imposters?replayable=true',
            port: options.port,
            hostname: options.host || 'localhost',
            headers: {
                'Content-Type': 'application/json',
                Connection: 'close'
            }
        };

    if (options.removeProxies) {
        requestOptions.path += '&removeProxies=true';
    }

    const request = http.request(requestOptions, response => {
        response.body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { response.body += chunk; });
        response.on('end', () => {
            deferred.resolve(response);
        });
    });

    request.on('error', deferred.reject);

    request.end();
    return deferred.promise;
}

// usage: stringify(includeFile)
// note: Trying to make this backwards compatible. However, the intent is to change
// the signature to just require `includeFile`.
function stringify (filename, includeFile, data) {
    const resolvedPath = makePathInABackwardsCompatibleWay(filename, includeFile);
    const contents = fs.readFileSync(resolvedPath, 'utf8'),
        rendered = ejs.render(contents, {
            data: data,
            filename: CONFIG_FILE_PATH,
            stringify: stringify,
            inject: stringify // backwards compatibility
        }),
        jsonString = JSON.stringify(rendered.trim());

    // get rid of the surrounding quotes because it makes the templates more natural to quote them there
    return jsonString.substring(1, jsonString.length - 1);
}

function makePathInABackwardsCompatibleWay (filename, includeFile) {
    var resolvedPath = null;
    if (!includeFile) {
        includeFile = filename;
    }
    resolvedPath = path.join(path.dirname(CONFIG_FILE_PATH), includeFile);
    return resolvedPath;
}

function getContentsOrExit (file, server) {
    try {
        return fs.readFileSync(file, 'utf8');
    }
    catch (e) {
        const message = e.code !== 'ENOENT' ? e : `No such file: ${file}`;
        server.close(() => { });
        console.error(message);
        process.exit(1);
        return '';
    }
}

var CONFIG_FILE_PATH = null;
function loadConfig (options, server) {
    if (!shouldLoadConfigFile(options)) {
        return Q(true);
    }
    CONFIG_FILE_PATH = options.configfile;
    const configContents = getContentsOrExit(options.configfile, server),
        parsedContents = options.noParse ? configContents : ejs.render(configContents, {
            filename: options.configfile,
            stringify: stringify,
            inject: stringify // backwards compatibility
        }),
        json = JSON.parse(parsedContents),
        // [json] Assume they left off the outer imposters array
        imposters = json.imposters || [json];

    return putConfig(options, JSON.stringify({ imposters: imposters }));
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

function save (options) {
    getConfig(options).then(response => {
        fs.writeFileSync(options.savefile, response.body);
    }).catch(ex => logConnectionErrorAndExit(options, ex)).done();
}

function replay (options) {
    options.removeProxies = true;

    getConfig(options).then(response => {
        if (response.statusCode !== 200) {
            console.error('Received status code ' + response.statusCode);
            console.error(response.body);
            process.exit(1);
        }
        else {
            putConfig(options, response.body);
        }
    }).catch(ex => logConnectionErrorAndExit(ex, options)).done();
}

module.exports = {
    loadConfig,
    save,
    replay
};
