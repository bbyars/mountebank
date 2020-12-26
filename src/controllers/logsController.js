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
    function getLogEntries () {
        const fs = require('fs');

        if (!logfile || !fs.existsSync(logfile)) {
            return [];
        }
        try {
            const json = '[' + fs.readFileSync(logfile).toString().split('\n').join(',').replace(/,$/, '') + ']';
            return JSON.parse(json);
        }
        catch (ex) {
            return [];
        }
    }

    /**
     * The function that responds to GET /logs
     * @memberOf module:controllers/logsController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function get (request, response) {
        const allLogs = getLogEntries(),
            url = require('url'),
            query = url.parse(request.url, true).query,
            startIndex = parseInt(query.startIndex || 0),
            endIndex = parseInt(query.endIndex || allLogs.length - 1),
            logs = allLogs.slice(startIndex, endIndex + 1);

        response.format({
            json: () => { response.send({ logs: logs }); },
            html: () => { response.render('logs', { logs: logs, escape: require('escape-html') }); }
        });
    }

    return { get };
}

module.exports = { create };
