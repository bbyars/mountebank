'use strict';

var date = require('../util/date');

function create (releases) {

    function get (request, response) {
        var hypermedia = {
                _links: {
                    imposters: { href: '/imposters' },
                    config: { href: '/config' },
                    logs: { href: '/logs' }
                }
            },
            notices = releases.map(function (release) {
                return {
                    version: release.version,
                    when: date.howLongAgo(release.date)
                };
            }).filter(function (notice) {
                return notice.when !== '';
            });

        notices.reverse();

        response.format({
            json: function () { response.send(hypermedia); },
            html: function () { response.render('index', { notices: notices }); }
        });
    }

    return {
        get: get
    };

}

module.exports = {
    create: create
};
