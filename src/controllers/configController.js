'use strict';

/**
 * The controller that exposes the mountebank configuration for the running process
 * @module
 */

/**
 * Creates the config controller
 * @param {string} version - The version of the currently running process
 * @param {Object} options - The command line options used to start mb
 * @returns {Object}
 */
function create (version, options) {
    var helpers = require('../util/helpers'),
        publicOptions = helpers.clone(options);

    delete publicOptions.heroku;
    delete publicOptions.version;

    /**
     * The method that responds to GET /config
     * @memberOf module:controllers/configController#
     * @param {Object} request - The HTTP request
     * @param {Object} response - The HTTP response
     */
    function get (request, response) {
        var config = {
            version: version,
            options: publicOptions,
            process: {
                nodeVersion: process.version,
                architecture: process.arch,
                platform: process.platform,
                rss: process.memoryUsage().rss,
                heapTotal: process.memoryUsage().heapTotal,
                heapUsed: process.memoryUsage().heapUsed,
                uptime: process.uptime(),
                cwd: process.cwd()
            }
        };

        response.format({
            json: function () { response.send(config); },
            html: function () { response.render('config', config); }
        });
    }

    return {
        get: get
    };
}

module.exports = {
    create: create
};
