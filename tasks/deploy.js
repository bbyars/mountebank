'use strict';

var run = require('./run').run,
    deploy = process.env.MB_DEPLOY || false,
    publish = process.env.MB_PUBLISH || false,
    buildNumber = process.env.TRAVIS_BUILD_NUMBER || 0;

module.exports = function (grunt) {

    function failTask (task) {
        return function (exitCode) {
            grunt.warn(task + ' failed', exitCode);
        };
    }

    grunt.registerTask('deployS3', 'Deploy artifacts to S3', function () {
        if (!deploy) {
            return;
        }

        run('scripts/deploy/deployS3', []).done(this.async(), failTask('deployS3'));
    });

    grunt.registerTask('deployHeroku', 'Deploy artifacts to Heroku', function () {
        if (!deploy) {
            return;
        }

        run('scripts/deploy/deployHeroku', [publish]).done(this.async(), failTask('deployHeroku'));
    });

    grunt.registerTask('deployNpm', 'Deploy artifacts to npm', function () {
        if (!deploy) {
            return;
        }

        run('scripts/deploy/deployNpm', [publish, buildNumber]).done(this.async(), failTask('deployNpm'));
    });
};
