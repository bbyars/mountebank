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
    const fs = require('fs-extra');

    return new Promise((resolve, reject) => {
        fs.readFile(options.configfile, { encoding: 'utf8' }, (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(JSON.parse(decode(data)));
            }
        });
    });
}

function save (options, imposters) {
    const fs = require('fs-extra');

    return new Promise((resolve, reject) => {
        fs.writeFile(options.savefile, encode(imposters), err => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}

module.exports = { load, save };
