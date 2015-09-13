'use strict';

var fs = require('fs-extra'),
    os = require('os'),
    path = require('path'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version,
    run = require('./run').run;

function forEachFileIn (dir, fileCallback, options) {
    fs.readdirSync(dir).forEach(function (file) {
        var filePath = path.join(dir, file);

        if (fs.lstatSync(filePath).isDirectory()) {
            forEachFileIn(filePath, fileCallback, options);
        } else {
            fileCallback(filePath);
        }
    });
    if (options.after) {
        options.after(dir);
    }
}

function rmdirRecursiveSync (dir) {
    if (!fs.existsSync(dir)) {
        return;
    }

    forEachFileIn(dir, fs.unlinkSync, { after: fs.rmdirSync } );
}

module.exports = function (grunt) {

    grunt.registerTask('dist', 'Create trimmed down distribution directory', function () {
        var done = this.async(),
            newPackage = JSON.parse(JSON.stringify(thisPackage));

        // This doesn't work on Windows
        //fs.removeSync('dist');
        rmdirRecursiveSync('dist');
        fs.mkdirSync('dist');
        fs.mkdirSync('dist/mountebank');
        ['bin', 'src', 'package.json', 'releases.json', 'README.md', 'LICENSE'].forEach(function (source) {
            fs.copySync(source, 'dist/mountebank/' + source);
        });
        //fs.removeSync('dist/mountebank/src/public/images/sources');
        rmdirRecursiveSync('dist/mountebank/src/public/images/sources');

        // removing devDependencies so the standard npm install (without --production) is smooth
        // in all cases.  The jsdom dependency gets tricky otherwise, since we need different versions
        // based on different versions of node
        delete newPackage.devDependencies;
        delete newPackage.devDependenciesBasedOnNodeVersion;
        fs.writeFileSync('dist/mountebank/package.json', JSON.stringify(newPackage, null, 2));

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
