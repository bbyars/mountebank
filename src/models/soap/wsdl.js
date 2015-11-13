'use strict';

/**
 * WSDL helpers
 * @module
 */

var util = require('util'),
    WSDL = require('soap').WSDL,
    Q = require('q');

/**
 * Parses wsdl
 * @param {string} xml - The wsdl
 * @returns {Object}
 */
function parse (xml) {
    /**
     * Returns true if the wsdl is empty
     * @memberOf module:models/soap/wsdl#
     * @returns {boolean}
     */
    function isEmpty () {
        return !xml;
    }

    /**
     * Creates the SOAP body response for the given request, filling in gaps
     * based on the WSDL
     * @memberOf module:models/soap/wsdl#
     * @param {Object} options - The options
     * @param {Object} options.request - The http request
     * @param {string} options.namespacePrefix - The alias to use for namespaces
     * @param {Object} [options.stub] - The stub used to respond to this request
     * @returns {Object} - Promise resolving to the body
     */
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
                body = util.format('<%s>', responseName),
                response = options.stub.response || {};

            Object.keys(responseFields).forEach(function (fieldName) {
                var fieldValue = response[fieldName] || '';
                body += util.format('<%s>%s</%s>', fieldName, fieldValue, fieldName);
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
