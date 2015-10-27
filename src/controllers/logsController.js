'use strict';

var fs = require('fs'),
    url = require('url');

function create (logfile) {
    function get (request, response) {
        var json = '[' + fs.readFileSync(logfile).toString().split('\n').join(',').replace(/,$/, '') + ']',
            allLogs = JSON.parse(json),
            query = url.parse(request.url, true).query,
            startIndex = parseInt(query.startIndex || 0),
            endIndex = parseInt(query.endIndex || allLogs.length - 1),
            logs = allLogs.slice(startIndex, endIndex + 1);

        response.format({
            json: function () { response.send({ logs: logs }); },
            html: function () { response.render('logs', { logs: logs }); }
        });
    }

    return {
        get: get
    };
}

module.exports = {
    create: create
};
