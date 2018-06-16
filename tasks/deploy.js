'use strict';

var run = require('./run').run,
    publish = process.env.MB_PUBLISH === 'true',
    version = require('./version').getVersion();

module.exports = function (grunt) {

    function failTask (task) {
        return function (exitCode) {
            grunt.warn(task + ' failed', exitCode);
        };
    }

    grunt.registerTask('deploy:s3', 'Deploy artifacts to S3', function () {
        run('scripts/deploy/deployS3', []).done(this.async(), failTask('deploy:s3'));
    });

    grunt.registerTask('deploy:heroku', 'Deploy artifacts to Heroku', function () {
        run('scripts/deploy/deployHeroku', [publish]).done(this.async(), failTask('deploy:heroku'));
    });

    grunt.registerTask('deploy:npm', 'Deploy artifacts to npm', function () {
        run('scripts/deploy/deployNpm', [publish]).done(this.async(), failTask('deploy:npm'));
    });

    grunt.registerTask('deploy:docs', 'Deploy source docs to BitBalloon', function () {
        run('scripts/deploy/deployFirebase', [version]).done(this.async(), failTask('deploy:docs'));
    });
};
