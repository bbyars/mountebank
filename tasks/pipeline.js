'use strict';

var Q = require('q'),
    exec = require('child_process').exec,
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version,
    hasTriggerRights = process.env.MB_DEPLOY === 'true',
    appveyor = require('./ci/appveyor'),
    travis = require('./ci/travis');

function getCurrentCommitId () {
    var deferred = Q.defer();
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
    grunt.registerTask('trigger:appveyor', 'Trigger Appveyor build for same commit', function () {
        if (!hasTriggerRights) {
            return;
        }

        var done = this.async();

        getCurrentCommitId().then(function (commitId) {
            return appveyor.triggerBuild(commitId, version);
        }).done(function (result) {
            process.env.MB_APPVEYOR_BUILD_NUMBER = result.version;
            console.log('Appveyor build successfully triggered for ' + version + ' => ' + result.version);
            done();
        }, function (error) {
            grunt.warn(error);
        });
    });

    grunt.registerTask('waitFor:appveyor', 'Wait for appveyor build to finish', function () {
        var done = this.async(),
            timeout = 10 * 60 * 1000,
            interval = 3000,
            start = new Date(),
            spinWait = function (status) {
                var deferred = Q.defer(),
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
                    return Q.delay(interval).then(function () {
                        return appveyor.getBuildStatus(process.env.MB_APPVEYOR_BUILD_NUMBER);
                    }).then(spinWait, deferred.reject);
                }

                return deferred.promise;
            };

        return spinWait('queued').then(function (status) {
            console.log('Appveyor status: ' + status);
            if (status !== 'success') {
                grunt.warn('Build failed');
            }
            done();
        }, function (error) {
            grunt.warn(error);
        });
    });

    grunt.registerTask('trigger:travis', 'Trigger Travis build for latest commit', function () {
        var done = this.async();

        return travis.triggerBuild(version).then(function (result) {
            process.env.MB_TRAVIS_BUILD_NUMBER = result;
            console.log('Travis CI build successfully triggered for ' + version + ' => ' + result);
            done();
        }, function (error) {
            grunt.warn(error);
        });
    });

    grunt.registerTask('waitFor:travis', 'Wait for Travis build to finish', function () {
        var done = this.async(),
            timeout = 10 * 60 * 1000,
            interval = 3000,
            start = new Date(),
            spinWait = function (status) {
                var deferred = Q.defer(),
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
                    return Q.delay(interval).then(function () {
                        return travis.getBuildStatus(process.env.MB_TRAVIS_BUILD_NUMBER);
                    }).then(spinWait, deferred.reject);
                }

                return deferred.promise;
            };

        return spinWait('pending').then(function (status) {
            console.log('Travis status: ' + status);
            if (status !== 'passed') {
                grunt.warn('Build failed');
            }
            done();
        }, function (error) {
            grunt.warn(error);
        });
    });
};
