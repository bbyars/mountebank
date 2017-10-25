'use strict';

/**
 * The controller that gets and deletes single imposters
 * @module
 */

/**
 * Creates the imposter controller
 * @param {Object} imposters - the map of ports to imposters
 * @returns {{get: get, del: del}}
 */
function create (imposters) {
    function queryBoolean (query, key) {
        var helpers = require('../util/helpers');

        if (!helpers.defined(query[key])) {
            return false;
        }
        return query[key].toLowerCase() === 'true';
    }

    /**
     * The function responding to GET /imposters/:port
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function get (request, response) {
        var url = require('url'),
            query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') },
            imposter = imposters[request.params.id].toJSON(options);
        // possibly unncessary for GET operation, per bbyars request it is not altering any state
        recordImposter(imposter);
        response.format({
            json: function () { response.send(imposter); },
            html: function () {
                if (request.headers['x-requested-with']) {
                    response.render('_imposter', { imposter: imposter });
                }
                else {
                    response.render('imposter', { imposter: imposter });
                }
            }
        });
    }

    function recordImposter (saveImposter) {
        var mountebank = require('../mountebank');
        var saveFile = mountebank.saveImpostersFile;
        var saveFileFlag = mountebank.saveImpostersFileFlag;
        var saveInDirectory = mountebank.ImposterDir;
        var path = require('path');
        var joinPath;
        if ((saveFileFlag) && (saveFile !== undefined)) {
            var makeString = saveFile.toString();
            var getStoredFileName = makeString.split('.');
            var fs = require('fs');
            var saveArray;
            var resultPort = (saveImposter.port).toString();
            var storeImposterDir = './StoreImposters';
            if ((saveInDirectory !== undefined)) {
                joinPath = path.join(saveInDirectory, saveFile);
            }
            else {
                saveInDirectory = '';
                joinPath = path.join(saveInDirectory, saveFile);
            }
            var textFinal = fs.readFileSync(joinPath, 'utf-8');
            if (textFinal !== '') {
                var parseImposter = JSON.parse(textFinal);
                (parseImposter.imposters).forEach(function (parse, index) {
                    var savePort = (parse.port).toString();
                    if (savePort === resultPort) {
                        (parseImposter.imposters).splice(index, 1);
                        saveArray = parseImposter.imposters;
                        saveArray.push(saveImposter);
                    }
                });
                fs.writeFileSync(joinPath, '{"imposters":' + JSON.stringify(saveArray) + '}');

                var textFinalStored = fs.readFileSync(storeImposterDir + '/store_imposters_' + getStoredFileName[0] + '.json', 'utf-8');
                var constructStored = '[' + textFinalStored.slice(0, -1) + ']';
                var parseImposterStored = JSON.parse(constructStored);
                parseImposterStored.forEach(function (parseStored, index) {
                    var savePortStored = (parseStored.port).toString();
                    if (savePortStored === resultPort) {
                        parseImposterStored.splice(index, 1);
                        parseImposterStored.push(saveImposter);
                    }
                });
                var eliminateArray = JSON.stringify(parseImposterStored);
                var finalArray = eliminateArray.slice(1, -1);
                fs.writeFileSync(storeImposterDir + '/store_imposters_' + getStoredFileName[0] + '.json', finalArray + ',');
            }
        }
    }

    function deleteImposter (id) {
        var mountebank = require('../mountebank');
        var saveFile = mountebank.saveImpostersFile;
        var saveFileFlag = mountebank.saveImpostersFileFlag;
        var saveInDirectory = mountebank.ImposterDir;
        var path = require('path');
        var joinPath;
        if ((saveFileFlag) && (saveFile !== undefined)) {
            var makeString = saveFile.toString();
            var getStoredFileName = makeString.split('.');
            var fs = require('fs');
            var myArray = [];
            var myArrayStored = [];
            var storeImposterDir = './StoreImposters';
            if ((saveInDirectory !== undefined)) {
                joinPath = path.join(saveInDirectory, saveFile);
            }
            else {
                saveInDirectory = '';
                joinPath = path.join(saveInDirectory, saveFile);
            }
            var textFinal = fs.readFileSync(joinPath, 'utf-8');
            if (textFinal !== '') {
                var parseImposter = JSON.parse(textFinal);
                (parseImposter.imposters).forEach(function (parse) {
                    var savePort = (parse.port).toString();
                    var deletePort = id.toString();
                    if (savePort !== deletePort) {
                        myArray.push(parse);
                    }
                });
                fs.writeFileSync(joinPath, '{"imposters":' + JSON.stringify(myArray) + '}');
                var textFinalStored = fs.readFileSync(storeImposterDir + '/store_imposters_' + getStoredFileName[0] + '.json', 'utf-8');
                var constructStored = '[' + textFinalStored.slice(0, -1) + ']';
                var parseImposterStored = JSON.parse(constructStored);
                parseImposterStored.forEach(function (parseStored) {
                    var savePortStored = (parseStored.port).toString();
                    var deletePortStored = id.toString();
                    if (savePortStored !== deletePortStored) {
                        myArrayStored.push(parseStored);
                    }
                });
                var eliminateArray = JSON.stringify(myArrayStored);
                var finalArray = eliminateArray.slice(1, -1);
                fs.writeFileSync(storeImposterDir + '/store_imposters_' + getStoredFileName[0] + '.json', finalArray.trim() + ',');
                var textFinalStoredDeleteComma = fs.readFileSync(storeImposterDir + '/store_imposters_' + getStoredFileName[0] + '.json', 'utf-8');
                if (textFinalStoredDeleteComma === ',') {
                    textFinalStoredDeleteComma.replace(/^\,/, '');
                    fs.writeFileSync(storeImposterDir + '/store_imposters_' + getStoredFileName[0] + '.json', '');
                }
            }
        }
    }

    /**
     * The function responding to DELETE /imposters/:port
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing
     */
    function del (request, response) {
        var Q = require('q'),
            imposter = imposters[request.params.id],
            json = {},
            url = require('url'),
            query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') };

        if (imposter) {
            json = imposter.toJSON(options);
            return imposter.stop().then(function () {
                delete imposters[request.params.id];
                var saveDelport = request.params.id;
                deleteImposter(saveDelport);
                response.send(json);
            });
        }
        else {
            response.send(json);
            return Q(true);
        }
    }

    return {
        get: get,
        del: del
    };
}

module.exports = {
    create: create
};
