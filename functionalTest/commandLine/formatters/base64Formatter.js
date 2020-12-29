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
        contents = fs.readFileSync(options.configfile, { encoding: 'utf8' });
    return JSON.parse(decode(contents));
}

function save (options, imposters) {
    const fs = require('fs');

    if (options.customName && imposters.imposters.length > 0) {
        imposters.imposters[0].name = options.customName;
    }
    fs.writeFileSync(options.savefile, encode(imposters));
}

module.exports = { load, save };
