'use strict';

var util = require('util'),
    WSDL = require('soap').WSDL,
    Q = require('q');

function parse (xml) {
    function isEmpty () {
        return !xml;
    }

    function createBodyFor (options) {
        var wsdl = new WSDL(xml, null, {}),
            deferred = Q.defer();

        wsdl.onReady(function (err) {
            //console.log(JSON.stringify(wsdl, null, 4));
            deferred.resolve(util.format('<%s:loginResponse><sessionid>SUCCESS</sessionid></%s:loginResponse>',
                options.namespacePrefix, options.namespacePrefix));
        });
        return deferred.promise;
    }

    return {
        isEmpty: isEmpty,
        createBodyFor: createBodyFor
    };
}

module.exports = {
    parse: parse
};
