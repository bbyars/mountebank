'use strict';

function parse (wsdl) {
    function isEmpty () {
        return !wsdl;
    }

    function namespaceFor () {

    }

    function bodyFor () {

    }

    return {
        isEmpty: isEmpty,
        namespaceFor: namespaceFor,
        bodyFor: bodyFor
    };
}

module.exports = {
    parse: parse
};
