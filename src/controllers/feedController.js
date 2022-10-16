'use strict';

const path = require('path'),
    fsExtra = require('fs-extra'),
    ejs = require('ejs'),
    helpers = require('../util/helpers.js');

/**
 * The controller that exposes information about releases
 * @module
 */

/**
 * @param {Object} releases - The object represented in the releases.json file
 * @param {Object} options - The command line options used to start mountebank
 * @returns {Object} The controller
 */
function create (releases) {
    const feedReleases = helpers.clone(releases);

    // Init once since we hope many consumers poll the heroku feed and we don't have monitoring
    feedReleases.reverse();

    function releaseViewFor (version) {
        return `releases/${version}.ejs`;
    }

    function releaseFilenameFor (version) {
        return path.join(__dirname, '/../views/', releaseViewFor(version));
    }

    function versionInWhitelist (version) {
        // Prevent path traversal attack like v2.3.0%2f..%2f..%2f_header
        return feedReleases.some(release => version.toLowerCase() === release.version);
    }

    /**
     * The function that responds to GET /feed
     * @memberOf module:controllers/feedController#
     * @param {Object} request - The HTTP request
     * @param {Object} response - The HTTP response
     */
    function getFeed (request, response) {
        const page = parseInt(request.query.page || '1'),
            nextPage = page + 1,
            entriesPerPage = 10,
            hasNextPage = feedReleases.slice((nextPage * entriesPerPage) - 10, entriesPerPage * nextPage).length > 0,
            config = {
                host: request.headers.host,
                releases: feedReleases.slice(page * entriesPerPage - 10, entriesPerPage * page),
                hasNextPage: hasNextPage,
                nextLink: `/feed?page=${nextPage}`
            };

        // I'd prefer putting this as an include in the view, but EJS doesn't support dynamic includes
        config.releases.forEach(release => {
            if (!release.view) {
                const contents = fsExtra.readFileSync(releaseFilenameFor(release.version), { encoding: 'utf8' });
                release.view = ejs.render(contents, {
                    host: request.headers.host,
                    releaseMajorMinor: release.version.replace(/^v(\d+\.\d+).*/, '$1'),
                    releaseVersion: release.version.replace('v', '')
                });
            }
        });

        response.type('application/atom+xml');
        response.render('feed', config);
    }

    /**
     * The function that responds to GET /releases
     * @memberOf module:controllers/feedController#
     * @param {Object} request - The HTTP request
     * @param {Object} response - The HTTP response
     */
    function getReleases (request, response) {
        response.render('releases', { releases: feedReleases });
    }

    /**
     * The function that responds to GET /releases/:version
     * @memberOf module:controllers/feedController#
     * @param {Object} request - The HTTP request
     * @param {Object} response - The HTTP response
     */
    function getRelease (request, response) {
        const version = request.params.version,
            config = {
                host: request.headers.host,
                releaseMajorMinor: version.replace(/^v(\d+\.\d+).*/, '$1'),
                releaseVersion: version.replace('v', '')
            };

        if (versionInWhitelist(version) && fsExtra.existsSync(releaseFilenameFor(version))) {
            response.render('_header', config, (headerError, header) => {
                if (headerError) { throw headerError; }
                response.render(releaseViewFor(version), config, (bodyError, body) => {
                    if (bodyError) { throw bodyError; }
                    response.render('_footer', config, (footerError, footer) => {
                        if (footerError) { throw footerError; }
                        response.send(header + body + footer);
                    });
                });
            });
        }
        else {
            response.status(404).send('No such release');
        }
    }

    return { getFeed, getReleases, getRelease };
}

module.exports = { create };
