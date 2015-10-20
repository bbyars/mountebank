'use strict';

var helpers = require('../util/helpers');

function create (version, options) {

    var publicOptions = helpers.clone(options);
    delete publicOptions.heroku;
    delete publicOptions.version;

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
            },
            environment: process.env
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
