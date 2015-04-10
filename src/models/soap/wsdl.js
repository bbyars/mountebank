'use strict';

function parse (wsdl) {
    return {
        isEmpty: function () {
            return !wsdl;
        }
    };
}

module.exports = {
    parse: parse
};
