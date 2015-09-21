'use strict';

var fs = require('fs-extra'),
    os = require('os'),
    isWindows = require('os').platform().indexOf('win') === 0,
    path = require('path'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version,
    run = require('./run').run;

function rmdirRecursiveSync (dir) {
    if (isWindows) {
        if (!fs.existsSync(dir)) {
            return;
        }

        fs.readdirSync(dir).forEach(function (file) {
            var filePath = path.join(dir, file);

            if (fs.lstatSync(filePath).isDirectory()) {
                rmdirRecursiveSync(filePath);
            } else {
                fs.unlinkSync(filePath);
            }
        });

        fs.rmdirSync(dir);
    }
    else {
        // This doesn't appear to work on Windows
        fs.removeSync(dir);
    }
}

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

        // This doesn't work on Windows
        rmdirRecursiveSync('dist');
        fs.mkdirSync('dist');
        fs.mkdirSync('dist/mountebank');
        ['bin', 'src', 'package.json', 'releases.json', 'README.md', 'LICENSE'].forEach(function (source) {
            fs.copySync(source, 'dist/mountebank/' + source);
        });
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
