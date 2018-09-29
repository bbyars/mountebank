'use strict';

const Q = require('q'),
    exec = require('child_process').exec,
    version = require('./version').getVersion(),
    appveyor = require('./ci/appveyor'),
    travis = require('./ci/travis'),
    fs = require('fs');

function getCurrentCommitId () {
    const deferred = Q.defer();
    exec('git rev-parse HEAD', function (error, stdout) {
        if (error) {
            deferred.reject(error);
        }
        else {
            deferred.resolve(stdout.trim());
        }
    });
    return deferred.promise;
}

module.exports = function (grunt) {
    grunt.registerTask('trigger:appveyor', 'Trigger Appveyor build for same commit', () => {
        const done = this.async();

        getCurrentCommitId().then(function (commitId) {
            return appveyor.triggerBuild(commitId, version);
        }).done(result => {
            // We have to save off the Appveyor build number for the next CI stage
            fs.writeFileSync('appveyor-' + version + '.txt', result.version);
            console.log('Appveyor build successfully triggered for ' + version + ' => ' + result.version);
            done();
        }, error => {
            grunt.warn(error);
        });
    });

    grunt.registerTask('waitFor:appveyor', 'Wait for appveyor build to finish', () => {
        const done = this.async(),
            buildNumber = fs.readFileSync('appveyor-' + version + '.txt'),
            timeout = 10 * 60 * 1000,
            interval = 3000,
            start = new Date(),
            spinWait = function (status) {
                const deferred = Q.defer(),
                    elapsedTime = new Date() - start;

                process.stdout.write('.');
                if (elapsedTime > timeout) {
                    process.stdout.write('\n');
                    deferred.resolve('timeout');
                }
                else if (['queued', 'running'].indexOf(status) < 0) {
                    process.stdout.write('\n');
                    deferred.resolve(status);
                }
                else {
                    return Q.delay(interval).then(() => appveyor.getBuildStatus(buildNumber)).then(spinWait, deferred.reject);
                }

                return deferred.promise;
            };

        console.log('Checking Appveyor build ' + buildNumber);
        return spinWait('queued').then(function (status) {
            console.log('Appveyor status: ' + status);
            if (status !== 'success') {
                grunt.warn('Build failed');
            }
            done();
        }, error => {
            grunt.warn(error);
        });
    });

    grunt.registerTask('trigger:travis', 'Trigger Travis build for latest commit', () => {
        const done = this.async();

        return travis.triggerBuild(version).then(result => {
            // We have to save off the Appveyor build number for the next CI stage
            fs.writeFileSync('travis-' + version + '.txt', result);
            console.log('Travis CI build successfully triggered for ' + version + ' => ' + result);
            done();
        }, error => {
            grunt.warn(error);
        });
    });

    grunt.registerTask('waitFor:travis', 'Wait for Travis build to finish', () => {
        const done = this.async(),
            buildNumber = fs.readFileSync('travis-' + version + '.txt'),
            timeout = 10 * 60 * 1000,
            interval = 3000,
            start = new Date(),
            spinWait = function (status) {
                const deferred = Q.defer(),
                    elapsedTime = new Date() - start;

                // process.stdout.write('.');
                process.stdout.write(status + '\n');
                if (elapsedTime > timeout) {
                    // process.stdout.write('\n');
                    deferred.resolve('timeout');
                }
                else if (['pending', 'created', 'started'].indexOf(status) < 0) {
                    process.stdout.write('\n');
                    deferred.resolve(status);
                }
                else {
                    return Q.delay(interval).then(() => travis.getBuildStatus(buildNumber)).then(spinWait, deferred.reject);
                }

                return deferred.promise;
            };

        return spinWait('pending').then(function (status) {
            console.log('Travis status: ' + status);
            if (status !== 'passed') {
                grunt.warn('Build failed');
            }
            done();
        }, error => {
            grunt.warn(error);
        });
    });
};
