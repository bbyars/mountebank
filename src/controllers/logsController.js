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
        const fs = require('fs-extra');

        if (!logfile || !fs.existsSync(logfile)) {
            return [{ level: 'error', message: 'No logfile' }];
        }
        try {
            const entries = fs.readFileSync(logfile).toString().split('\n'),
                json = '[' + entries.join(',').replace(/,$/, '') + ']';
            return JSON.parse(json);
        }
        catch (ex) {
            return [{ level: 'error', message: 'This page only works for JSON file logging' }];
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
            startIndex = parseInt(request.query.startIndex || 0),
            endIndex = parseInt(request.query.endIndex || allLogs.length - 1),
            logs = allLogs.slice(startIndex, endIndex + 1);

        response.format({
            json: () => response.send({ logs: logs }),
            html: () => response.render('logs', { logs: logs, escape: require('escape-html') })
        });
    }

    return { get };
}

module.exports = { create };
