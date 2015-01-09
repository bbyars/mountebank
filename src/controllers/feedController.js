'use strict';

var fs = require('fs'),
    ejs = require('ejs');

function create (version, releases, options) {

    function getFeed (request, response) {
        var config = { host: request.headers.host, releases: releases };

        if (!releases[0].view) {
            releases.forEach(function (release) {
                var contents = fs.readFileSync(__dirname + '/../views/releases/' + release.version + '.ejs', { encoding: 'utf8' });
                release.view = ejs.render(contents, { host: request.headers.host });
            });
        }

        response.type('application/atom+xml');
        response.render('feed', config);
    }

    function getReleases (request, response) {
        var versions = releases.map(function (release) { return release.version; });
        response.render('releases', { versions: versions });
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
        getReleases: getReleases,
        getRelease: getRelease
    };
}

module.exports = {
    create: create
};
