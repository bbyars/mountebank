'use strict';

var util = require('util');

function parse (wsdl) {
    function isEmpty () {
        return !wsdl;
    }

    function bodyFor (options) {
        return util.format('<%s:loginResponse><sessionid>SUCCESS</sessionid></%s:loginResponse>',
            options.namespacePrefix, options.namespacePrefix);
    }

    return {
        isEmpty: isEmpty,
        bodyFor: bodyFor
    };
}

module.exports = {
    parse: parse
};
