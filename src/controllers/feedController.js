'use strict';

var fs = require('fs');

function create (version, options) {

    function getFeed (request, response) {
        var config = { host: request.headers.host };
        response.type('application/atom+xml');
        response.render('feed', config);
    }

    function getRelease (request, response) {
        var config = { host: request.headers.host, heroku: options.heroku, version: version },
            releaseFilename = 'releases/' + request.params.version + '.ejs';

        if (fs.existsSync(__dirname + '/../views/' + releaseFilename)) {
            response.render('_header', config, function (error, header) {
                response.render(releaseFilename, config, function (error, body) {
                    response.render('_footer', config, function (error, footer) {
                        response.send(header + body + footer);
                    });
                });
            });
        }
        else {
            response.send(404, 'No such release');
        }
    }

    return {
        getFeed: getFeed,
        getRelease: getRelease
    };
}

module.exports = {
    create: create
};
