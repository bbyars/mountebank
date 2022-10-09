'use strict';

const date = require('../util/date.js');

/**
 * The controller that returns the base mountebank hypermedia
 * @module
 */

/**
 * Creates the home controller
 * @param {Object} releases - The releases.json file
 * @returns {Object} The controller
 */
function create (releases) {
    function createNotice (release) {
        return {
            version: release.version,
            when: date.howLongAgo(release.date)
        };
    }

    function isRecent (notice) {
        return notice.when !== '';
    }

    /**
     * The function that responds to GET /
     * @memberOf module:controllers/homeController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function get (request, response) {
        const hypermedia = {
                _links: {
                    imposters: { href: '/imposters' },
                    config: { href: '/config' },
                    logs: { href: '/logs' }
                }
            },
            notices = releases.map(createNotice).filter(isRecent),
            viewNotices = [];

        if (notices.length > 0) {
            notices.reverse();
            viewNotices.push(notices[0]);
        }

        response.format({
            json: () => { response.send(hypermedia); },
            html: () => { response.render('index', { notices: viewNotices }); }
        });
    }

    return { get };
}

module.exports = { create };
