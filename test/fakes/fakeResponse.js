'use strict';

function create () {
    return {
        headers: {},
        send: function (body) { this.body = body; },
        setHeader: function (key, value) { this.headers[key] = value; }
    };
}

module.exports = {
    create: create
};
