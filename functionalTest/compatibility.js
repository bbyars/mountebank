'use strict';

var http = require('http');

// for new Buffer([0,1,2,3]).toJSON()
//      - v0.10 returns [0.1,2,3]
//      - v0.12 returns { type: 'Buffer', data: [0,1,2,3] }
function bufferJSON (buffer) {
    var result = buffer.toJSON();
    return result.data ? result.data : result;
}

var headersAlreadyPatched = false;

// Patch ServerRequest to save unmodified copy of headers so we get original case
// (see https://github.com/bbyars/mountebank/issues/75)
// This is only needed for node 0.10 compatibility as we get rawHeaders with 0.12+
// Adapted rom http://grokbase.com/t/gg/nodejs/125ynyxa6c/need-raw-http-headers
function patchRawHeaders () {
    /* eslint-disable no-underscore-dangle */
    if (!headersAlreadyPatched && process.version.indexOf('v0.10') === 0) {
        var incomingMessagePrototype = http.IncomingMessage.prototype,
            _addHeaderLine = incomingMessagePrototype._addHeaderLine;

        incomingMessagePrototype._addHeaderLine = function (field, value) {
            this.rawHeaders = this.rawHeaders || [];
            this.rawHeaders.push(field);
            this.rawHeaders.push(value);
            _addHeaderLine.call(this, field, value);
        };
    }
}

module.exports = {
    bufferJSON: bufferJSON,
    patchRawHeaders: patchRawHeaders
};
