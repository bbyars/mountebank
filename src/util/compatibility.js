'use strict';

var http = require('http');

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

        headersAlreadyPatched = true;
    }
}

module.exports = {
    patchRawHeaders: patchRawHeaders
};
