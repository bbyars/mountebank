'use strict';

var fs = require('fs-extra'),
    os = require('os'),
    rimraf = require('rimraf'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version,
    run = require('./run').run;

module.exports = function (grunt) {

    function failTask (task) {
        return function (exitCode) {
            grunt.warn(task + ' failed', exitCode);
        };
    }

    grunt.registerTask('dist', 'Create trimmed down distribution directory', function () {
        var done = this.async(),
            newPackage = JSON.parse(JSON.stringify(thisPackage)),
            failed = failTask('dist');

        rimraf.sync('dist');
        fs.mkdirSync('dist');
        fs.mkdirSync('dist/mountebank');
        ['bin', 'src', 'package.json', 'package-lock.json', 'releases.json', 'README.md', 'LICENSE'].forEach(function (source) {
            fs.copySync(source, 'dist/mountebank/' + source);
        });
        rimraf.sync('dist/mountebank/src/public/images/sources');

        delete newPackage.devDependencies;
        delete newPackage.devDependenciesBasedOnNodeVersion;
        fs.writeFileSync('dist/mountebank/package.json', JSON.stringify(newPackage, null, 2));

        run('npm', ['install', '--production'], { cwd: 'dist/mountebank' }).done(function () {
            // Switch tests to use the mb from the dist directory to test what actually gets published
            process.env.MB_EXECUTABLE = 'dist/mountebank/bin/mb';
            done();
        }, failed);
    });

    grunt.registerTask('version', 'Set the version number', function () {
        var newPackage = require('../dist/mountebank/package.json');

        newPackage.version = version;
        console.log('Using version ' + version);
        fs.writeFileSync('./dist/mountebank/package.json', JSON.stringify(newPackage, null, 2) + '\n');
    });

    grunt.registerTask('dist:tarball', 'Create OS-specific tarballs', function (arch) {
        run('scripts/dist/createSelfContainedTarball', [os.platform(), arch || os.arch(), version]).done(
            this.async(), failTask('dist:tarball'));
    });

    grunt.registerTask('dist:zip', 'Create OS-specific zips', function (arch) {
        run('scripts/dist/createWindowsZip', [arch, version]).done(this.async(), failTask('dist:zip'));
    });

    grunt.registerTask('dist:npm', 'Create npm tarball', function () {
        var filename = 'mountebank-v' + version + '-npm.tar.gz';

        run('tar', ['czf', filename, 'mountebank'], { cwd: 'dist' }).done(this.async(), failTask('dist:npm'));
    });

    grunt.registerTask('dist:package', 'Create OS-specific package', function (type) {
        run('scripts/dist/createPackage', [os.platform(), type, version]).done(this.async(), failTask('dist:package'));
    });
};
