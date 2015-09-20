'use strict';

var run = require('./run').run,
    deploy = process.env.MB_DEPLOY || false,
    publish = process.env.MB_PUBLISH || false,
    buildNumber = process.env.TRAVIS_BUILD_NUMBER || 0;

module.exports = function (grunt) {

    grunt.registerTask('deployS3', 'Deploy artifacts to S3', function () {
        if (!deploy) {
            return;
        }

        var done = this.async();
        run('scripts/deploy/deployS3', []).done(function () { done(); });
    });

    grunt.registerTask('deployHeroku', 'Deploy artifacts to Heroku', function () {
        if (!deploy) {
            return;
        }

        var done = this.async();
        run('scripts/deploy/deployHeroku', [publish]).done(function () { done(); });
    });

    grunt.registerTask('deployNpm', 'Deploy artifacts to npm', function () {
        if (!deploy) {
            return;
        }

        var done = this.async();
        run('scripts/deploy/deployNpm', [publish, buildNumber]).done(function () { done(); });
    });
};
