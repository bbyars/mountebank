'use strict';

var url = require('url');

function create (imposters) {

    function get (request, response) {
        var query = url.parse(request.url, true).query,
            functionName = query.replayable ? 'toReplayableJSON' : 'toJSON',
            imposter = imposters[request.params.id][functionName]();

        response.format({
            json: function () { response.send(imposter); },
            html: function () { response.render('imposter', imposter); }
        });
    }

    function del (request, response) {
        var imposter = imposters[request.params.id],
            json = {};

        if (imposter) {
            json = imposter.toJSON();
            imposter.stop();
            delete imposters[request.params.id];
        }
        response.send(json);
    }

    return {
        get: get,
        del: del
    };
}

module.exports = {
    create: create
};
