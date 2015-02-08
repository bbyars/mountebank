'use strict';

var date = require('../util/date');

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

    function get (request, response) {
        var hypermedia = {
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
            json: function () { response.send(hypermedia); },
            html: function () { response.render('index', { notices: viewNotices }); }
        });
    }

    return {
        get: get
    };

}

module.exports = {
    create: create
};
