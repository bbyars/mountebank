'use strict';

const run = require('./run').run,
    publish = process.env.MB_PUBLISH === 'true',
    version = require('./version').getVersion();

module.exports = function (grunt) {
    grunt.registerTask('deploy:s3', 'Deploy artifacts to S3', async function () {
        try {
            await run('scripts/deploy/deployS3', []);
            this.async();
        }
        catch (exitCode) {
            grunt.warn('deploy:s3 failed', exitCode);
        }
    });

    grunt.registerTask('deploy:heroku', 'Deploy artifacts to Heroku', async function () {
        try {
            await run('scripts/deploy/deployHeroku', [publish]);
            this.async();
        }
        catch (exitCode) {
            grunt.warn('deploy:heroku', exitCode);
        }
    });

    grunt.registerTask('deploy:npm', 'Deploy artifacts to npm', async function () {
        try {
            await run('scripts/deploy/deployNpm', [publish]);
            this.async();
        }
        catch (exitCode) {
            grunt.warn('deploy:npm', exitCode);
        }
    });

    grunt.registerTask('deploy:docs', 'Deploy source docs', async function () {
        try {
            await run('scripts/deploy/deployFirebase', [version]);
            this.async();
        }
        catch (exitCode) {
            grunt.warn('deploy:docs', exitCode);
        }
    });

    grunt.registerTask('deploy:docker', 'Deploy Docker image', async function () {
        try {
            await run('scripts/deploy/deployDocker', [publish, version]);
            this.async();
        }
        catch (exitCode) {
            grunt.warn('deploy:docker', exitCode);
        }
    });
};
