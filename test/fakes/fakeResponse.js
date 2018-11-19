'use strict';

function create () {
    return {
        headers: {},
        send: function (body) { this.body = body; },
        setHeader: function (key, value) { this.headers[key] = value; },
        format: function (selectors) { selectors.json(); }
    };
}

module.exports = {
    create
};
