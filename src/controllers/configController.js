'use strict';

function create (version, options) {

    function get (request, response) {
        var config = {
            version: version,
            options: options,
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
