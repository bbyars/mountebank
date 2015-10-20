'use strict';

var fs = require('fs');

function create (logfile) {
    function get (request, response) {
        var json = '[' + fs.readFileSync(logfile).toString().split('\n').join(',').replace(/,$/, '') + ']',
            logs = JSON.parse(json);

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
