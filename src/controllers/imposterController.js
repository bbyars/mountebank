'use strict';

var url = require('url'),
    Q = require('q');

function create (imposters) {

    function queryBoolean (query, key) {
        if (!query.hasOwnProperty(key)) {
            return false;
        }
        return query[key].toLowerCase() === 'true';
    }

    function get (request, response) {
        var query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') },
            imposter = imposters[request.params.id].toJSON(options);

        response.format({
            json: function () { response.send(imposter); },
            html: function () {
                if (request.headers['x-requested-with']) {
                    response.render('_imposter', { imposter: imposter });
                }
                else {
                    response.render('imposter', imposter);
                }
            }
        });
    }

    function del (request, response) {
        var imposter = imposters[request.params.id],
            json = {},
            query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') };

        if (imposter) {
            json = imposter.toJSON(options);
            return imposter.stop().then(function () {
                delete imposters[request.params.id];
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
