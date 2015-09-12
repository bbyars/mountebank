'use strict';

var fs = require('fs-extra'),
    exec = require('child_process').exec,
    spawn = require('child_process').spawn,
    os = require('os'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version;

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
        exec('cd dist/mountebank && npm install --production', function () {
            // Switch tests to use the mb from the dist directory to test what actually gets published
            process.env.MB_EXECUTABLE = 'dist/mountebank/bin/mb';
            done();
        });
    });

    grunt.registerTask('dist:tarball', 'Create OS-specific tarballs', function (arch) {
        var done = this.async(),
            tar = spawn('scripts/dist/createSelfContainedTarball', [os.platform(), arch || os.arch(), version]);

        tar.stdout.on('data', function (data) { console.log(data.toString('utf8').trim()); });
        tar.stderr.on('data', function (data) { console.error(data.toString('utf8').trim()); });
        tar.on('close', function (exitCode) {
            if (exitCode !== 0) {
                process.exit(exitCode);
            }
            fs.removeSync('dist-test');
            fs.mkdirSync('dist-test');

            fs.readdirSync('dist').forEach(function (filename) {
                if (filename.indexOf('.tar.gz') < 0) {
                    return;
                }

                fs.copySync('dist/' + filename, 'dist-test/' + filename);
                var untar = spawn('tar', ['xzf', filename], { cwd: 'dist-test' });
                untar.stdout.on('data', function (data) { console.log(data.toString('utf8').trim()); });
                untar.stderr.on('data', function (data) { console.error(data.toString('utf8').trim()); });
                untar.on('close', function (exitCode) {
                    if (exitCode !== 0) {
                        process.exit(exitCode);
                    }
                    fs.unlinkSync('dist-test/' + filename);

                    // Switch tests to use the mb from the tarball to test what actually gets published
                    process.env.MB_EXECUTABLE = 'dist-test/' + filename.replace('.tar.gz', '') + '/mb';
                    done();
                });
            });
        });
    });
};
