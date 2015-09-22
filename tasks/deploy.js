'use strict';

var run = require('./run').run,
    deploy = process.env.MB_DEPLOY || false,
    publish = process.env.MB_PUBLISH || false;

module.exports = function (grunt) {

    function failTask (task) {
        return function (exitCode) {
            grunt.warn(task + ' failed', exitCode);
        };
    }

    grunt.registerTask('deploy:s3', 'Deploy artifacts to S3', function () {
        if (!deploy) {
            return;
        }

        run('scripts/deploy/deployS3', []).done(this.async(), failTask('deploy:s3'));
    });

    grunt.registerTask('deploy:heroku', 'Deploy artifacts to Heroku', function () {
        if (!deploy) {
            return;
        }

        run('scripts/deploy/deployHeroku', [publish]).done(this.async(), failTask('deploy:heroku'));
    });

    grunt.registerTask('deploy:npm', 'Deploy artifacts to npm', function () {
        if (!deploy) {
            return;
        }

        run('scripts/deploy/deployNpm', [publish]).done(this.async(), failTask('deploy:npm'));
    });
};
