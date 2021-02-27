'use strict';

const httpClient = require('../../../baseHttpClient').create('http');

function parseHeader (line) {
    const parts = line.split(':');
    return {
        key: parts[0].trim(),
        value: parts.slice(1).join(':').trim()
    };
}

function parse (text) {
    const lines = text.split('\n'),
        firstLineParts = lines[0].split(' '),
        spec = {
            method: firstLineParts[0],
            path: firstLineParts[1],
            headers: {},
            body: ''
        };

    for (var i = 1; i < lines.length; i += 1) {
        if (lines[i].trim() === '') {
            break;
        }
        const header = parseHeader(lines[i]);
        spec.headers[header.key] = header.value;
        if (header.key.toLowerCase() === 'host') {
            const parts = header.value.split(':');
            spec.hostname = parts[0];
            spec.port = parseInt(header.value.split(':')[1].trim());
        }
    }

    spec.body = lines.slice(i).join('\n').trim();
    return spec;
}

function messageFor (statusCode) {
    const codes = {
        200: 'OK',
        201: 'Created',
        400: 'Bad Request',
        404: 'Not Found',
        405: 'Method Not Allowed',
        406: 'Not Acceptable',
        500: 'Internal Server Error'
    };
    if (codes[statusCode]) {
        return codes[statusCode];
    }
    else {
        throw Error(`unrecognized status code: ${statusCode}`);
    }
}

function properCase (text) {
    const parts = text.split('-'),
        properCasedParts = parts.map(name => name.substring(0, 1).toUpperCase() + name.substring(1));
    return properCasedParts.join('-');
}

function format (response) {
    let result = `HTTP/1.1 ${response.statusCode} ${messageFor(response.statusCode)}`;
    Object.keys(response.headers).forEach(header => {
        // Introduced in node v14, causes portability issues between versions
        if (header.toLowerCase() !== 'keep-alive') {
            result += `\n${properCase(header)}: ${response.headers[header]}`;
        }
    });
    if (response.body) {
        result += '\n\n';
        if (typeof response.body === 'object') {
            result += JSON.stringify(response.body, null, 2);
        }
        else {
            result += response.body;
        }
    }
    return result;
}

async function runStep (spec) {
    const requestSpec = parse(spec.requestText),
        response = await httpClient.responseFor(requestSpec);
    return format(response);
}

module.exports = { runStep };
