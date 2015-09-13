'use strict';

var fs = require('fs-extra'),
    spawn = require('child_process').spawn,
    os = require('os'),
    Q = require('q'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version;

function run (command, args, options) {
    var deferred = Q.defer(),
        proc = spawn(command, args, options);

    proc.stdout.on('data', function (data) { console.log(data.toString('utf8').trim()); });
    proc.stderr.on('data', function (data) { console.error(data.toString('utf8').trim()); });

    proc.on('close', function (exitCode) {
        if (exitCode !== 0) {
            process.exit(exitCode);
        }

        deferred.resolve();
    });

    return deferred.promise;
}

module.exports = function (grunt) {

    grunt.registerTask('dist', 'Create trimmed down distribution directory', function () {
        var done = this.async();

        fs.removeSync('dist');
        fs.mkdirSync('dist');
        fs.mkdirSync('dist/mountebank');
        ['bin', 'src', 'package.json', 'releases.json', 'README.md', 'LICENSE'].forEach(function (source) {
            fs.copySync(source, 'dist/mountebank/' + source);
        });
        fs.removeSync('dist/mountebank/src/public/images/sources');

        run('npm', ['install', '--production'], { cwd: 'dist/mountebank' }).done(function () {
            // Switch tests to use the mb from the dist directory to test what actually gets published
            process.env.MB_EXECUTABLE = 'dist/mountebank/bin/mb';
            done();
        });
    });

    grunt.registerTask('dist:tarball', 'Create OS-specific tarballs', function (arch) {
        var done = this.async();
        run('scripts/dist/createSelfContainedTarball', [os.platform(), arch || os.arch(), version]).done(function () {
            done();
        });
    });

    grunt.registerTask('dist:zip', 'Create OS-specific zips', function (arch) {
        var done = this.async();
        run('scripts/dist/createWindowsZip', [arch, version]).done(function () { done(); });
    });

    grunt.registerTask('dist:npm', 'Create npm tarball', function () {
        var done = this.async(),
            filename = 'mountebank-v' + version + '-npm.tar.gz';

        run('tar', ['czf', filename, 'mountebank'], { cwd: 'dist' }).done(function () {
            done();
        });
    });

    grunt.registerTask('dist:package', 'Create OS-specific package', function (type) {
        var done = this.async();
        run('scripts/dist/createPackage', [os.platform(), type, version]).done(function () { done(); });
    });
};
