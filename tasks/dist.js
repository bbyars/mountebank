'use strict';

var fs = require('fs-extra'),
    spawn = require('child_process').spawn,
    os = require('os'),
    Q = require('q'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version;

function run (command, args, options, fn) {
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
        var done = this.async(),
            npm;

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
        var done = this.async(),
            tarball;

        run('scripts/dist/createSelfContainedTarball', [os.platform(), arch || os.arch(), version]).then(function () {
            fs.removeSync('dist-test');
            fs.mkdirSync('dist-test');

            tarball = fs.readdirSync('dist').filter(function (file) {
                return file.indexOf('.tar.gz') > 0;
            })[0];

            fs.copySync('dist/' + tarball, 'dist-test/' + tarball);

            return run('tar', ['xzf', tarball], { cwd: 'dist-test' });
        }).done(function () {
            fs.unlinkSync('dist-test/' + tarball);

            // Switch tests to use the mb from the tarball to test what actually gets published
            process.env.MB_EXECUTABLE = 'dist-test/' + tarball.replace('.tar.gz', '') + '/mb';
            done();
        });
    });

    grunt.registerTask('dist:npm', 'Create npm tarball', function () {
        var done = this.async(),
            filename = 'mountebank-v' + version + '-npm.tar.gz';

        run('tar', ['czf', filename, 'mountebank'], { cwd: 'dist' }).then(function () {
            // Use a parent directory to avoid installing in project node_modules
            // Makes for a cleaner test; no interaction with our npm install
            fs.removeSync('../mb-dist-test');
            fs.mkdirSync('../mb-dist-test');
            fs.copySync('dist/' + filename, '../mb-dist-test/' + filename);

            return run('npm', ['install', './' + filename], { cwd: '../mb-dist-test' });
        }).done(function () {

            // Switch tests to use the mb from npm to test what actually gets published
            process.env.MB_EXECUTABLE = '../mb-dist-test/node_modules/.bin/mb';
            done();
        });
    });
};
