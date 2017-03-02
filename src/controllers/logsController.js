'use strict';

/**
 * The controller that exposes the logs
 * @module
 */

/**
 * Creates the logs controller
 * @param {string} logfile - the path to the logfile
 * @returns {{get: get}}
 */
function create (logfile) {
    /**
     * The function that responds to GET /logs
     * @memberOf module:controllers/logsController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function get (request, response) {
        var fs = require('fs'),
            json = '[' + fs.readFileSync(logfile).toString().split('\n').join(',').replace(/,$/, '') + ']',
            allLogs = JSON.parse(json),
            url = require('url'),
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
