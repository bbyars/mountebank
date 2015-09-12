'use strict';

var fs = require('fs-extra'),
    exec = require('child_process').exec,
    os = require('os'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version;

module.exports = function (grunt) {
    grunt.registerTask('dist', 'Create trimmed down distribution directory', function () {
        fs.removeSync('dist');
        fs.mkdirSync('dist');
        fs.mkdirSync('dist/mountebank');
        ['bin', 'src', 'package.json', 'releases.json', 'README.md', 'LICENSE'].forEach(function (source) {
            fs.copySync(source, 'dist/mountebank/' + source);
        });
        fs.removeSync('dist/mountebank/src/public/images/sources');
        exec('cd dist/mountebank && npm install --production', this.async());
    });

    grunt.registerTask('dist:tarball', 'Create OS-specific tarballs', function () {
        var done = this.async(),
            command = 'scripts/dist/createSelfContainedTarball ' + os.platform() + ' x64 ' + version;

        exec(command, { maxBuffer: 2048*2048 }, function () {
            fs.removeSync('dist-test');
            fs.mkdirSync('dist-test');

            fs.readdirSync('dist').forEach(function (filename) {
                if (filename.indexOf('.tar.gz') < 0) {
                    return;
                }

                fs.copySync('dist/' + filename, 'dist-test/' + filename);
                exec('cd dist-test && tar xzvf ' + filename, function () {
                    fs.unlinkSync('dist-test/' + filename);
                    done();
                });
            });
        });
    });
};
