'use strict';

/**
 * Demonstrates a silly custom formatter that saves the file as base64 encoding
 */

function encode (obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function decode (text) {
    return Buffer.from(text, 'base64').toString('utf8');
}

function load (options) {
    const fs = require('fs'),
        Q = require('q'),
        deferred = Q.defer();

    fs.readFile(options.configfile, { encoding: 'utf8' }, (err, data) => {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve(JSON.parse(decode(data)));
        }
    });
    return deferred.promise;
}

function save (options, imposters) {
    const fs = require('fs'),
        Q = require('q'),
        deferred = Q.defer();

    fs.writeFile(options.savefile, encode(imposters), err => {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve();
        }
    });
    return deferred;
}

module.exports = { load, save };
