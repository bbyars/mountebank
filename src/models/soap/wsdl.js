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

        wsdl.onReady(function () {
            var service = wsdl.services[Object.keys(wsdl.services)[0]],
                port = service.ports[Object.keys(service.ports)[0]],
                method = port.binding.methods[options.request.method.name],
                output = method.output,
                responseName = options.namespacePrefix + ':' + output.$name,
                responseFields = output.parts,
                body = util.format('<%s>', responseName);

            Object.keys(responseFields).forEach(function (fieldName) {
                body += util.format('<%s>%s</%s>', fieldName, options.stub.response[fieldName], fieldName);
            });

            body += util.format('</%s>', responseName);

            deferred.resolve(body);
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
