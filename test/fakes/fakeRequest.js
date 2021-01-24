'use strict';

function to (href, params) {
    const url = new URL(href, 'http://localhost:2525');
    let query = {};

    if (url.search !== '') {
        query = require('querystring').parse(url.search.substr(1));
    }

    return {
        url: href,
        query: query,
        params: params
    };
}

module.exports = { to };
