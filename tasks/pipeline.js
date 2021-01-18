'use strict';

const exec = require('child_process').exec,
    version = require('./version').getVersion(),
    appveyor = require('./ci/appveyor'),
    travis = require('./ci/travis'),
    fs = require('fs');

async function getCurrentCommitId () {
    return new Promise((resolve, reject) => {
        exec('git rev-parse HEAD', function (error, stdout) {
            if (error) {
                reject(error);
            }
            else {
                resolve(stdout.trim());
            }
        });
    });
}

module.exports = function (grunt) {
    grunt.registerTask('trigger:appveyor', 'Trigger Appveyor build for same commit', async function () {
        const done = this.async();

        try {
            const commitId = await getCurrentCommitId(),
                result = await appveyor.triggerBuild(commitId, version);

            // We have to save off the Appveyor build number for the next CI stage
            fs.writeFileSync('appveyor-' + version + '.txt', result.version);
            console.log('Appveyor build successfully triggered for ' + version + ' => ' + result.version);
            done();
        }
        catch (error) {
            grunt.warn(error);
        }
    });

    function delay (duration) {
        return new Promise(resolve => {
            setTimeout(() => resolve(), duration);
        });
    }

    grunt.registerTask('waitFor:appveyor', 'Wait for appveyor build to finish', async function () {
        const done = this.async(),
            buildNumber = fs.readFileSync('appveyor-' + version + '.txt'),
            timeout = 10 * 60 * 1000,
            interval = 3000,
            start = new Date(),
            spinWait = function (status) {
                const elapsedTime = new Date() - start;

                process.stdout.write('.');

                return new Promise((resolve, reject) => {
                    if (elapsedTime > timeout) {
                        process.stdout.write('\n');
                        resolve('timeout');
                    }
                    else if (['queued', 'running'].indexOf(status) < 0) {
                        process.stdout.write('\n');
                        resolve(status);
                    }
                    else {
                        delay(interval)
                            .then(() => appveyor.getBuildStatus(buildNumber))
                            .then(spinWait)
                            .catch(reject);
                    }
                });
            };

        console.log('Checking Appveyor build ' + buildNumber);

        try {
            const status = await spinWait('queued');
            console.log('Appveyor status: ' + status);
            if (status !== 'success') {
                grunt.warn('Build failed');
            }
            done();
        }
        catch (error) {
            grunt.warn(error);
        }
    });

    grunt.registerTask('trigger:travis', 'Trigger Travis build for latest commit', function () {
        const done = this.async();

        return travis.triggerBuild(version).then(function (result) {
            // We have to save off the Appveyor build number for the next CI stage
            fs.writeFileSync('travis-' + version + '.txt', result);
            console.log('Travis CI build successfully triggered for ' + version + ' => ' + result);
            done();
        }, function (error) {
            grunt.warn(error);
        });
    });

    grunt.registerTask('waitFor:travis', 'Wait for Travis build to finish', async function () {
        const done = this.async(),
            buildNumber = fs.readFileSync('travis-' + version + '.txt'),
            timeoutPerStatus = 30 * 60 * 1000,
            interval = 3000;

        let start = new Date(),
            lastStatus = '';

        function spinWait (status) {
            const elapsedTime = new Date() - start;

            if (status !== lastStatus) {
                process.stdout.write(`\n   took ${elapsedTime}ms\n${status}`);
                lastStatus = status;
                start = new Date();
            }

            process.stdout.write('.');

            return new Promise((resolve, reject) => {
                if (elapsedTime > timeoutPerStatus) {
                    resolve('timeout');
                }
                else if (['pending', 'created', 'started'].indexOf(status) < 0) {
                    resolve(status);
                }
                else {
                    delay(interval)
                        .then(() => travis.getBuildStatus(buildNumber))
                        .then(spinWait)
                        .catch(reject);
                }
            });
        }

        try {
            const status = await spinWait('pending');
            console.log('Travis status: ' + status);
            if (status !== 'passed') {
                grunt.warn('Build failed');
            }
            done();
        }
        catch (error) {
            grunt.warn(error);
        }
    });
};
