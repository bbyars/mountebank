'use strict';

var fs = require('fs-extra'),
    run = require('./run').run,
    os = require('os'),
    path = require('path'),
    util = require('util'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version,
// parent directory to avoid interaction with project node_modules
    testDir = '../.mb-test-dir';

module.exports = function (grunt) {

    grunt.registerTask('install:tarball', 'Set test executable to mb inside OS-specific tarball', function (arch) {
        var done = this.async(),
            tarball = util.format('mountebank-v%s-%s-%s.tar.gz', version, os.platform(), arch || os.arch()),
            tarballPath = path.join(testDir, tarball);

        fs.removeSync(testDir);
        fs.mkdirSync(testDir);
        fs.copySync('dist/' + tarball, tarballPath);

        run('tar', ['xzf', tarball], { cwd: testDir }).done(function () {
            fs.unlinkSync(tarballPath);
            process.env.MB_EXECUTABLE = tarballPath.replace('.tar.gz', '') + '/mb';
            done();
        }, process.exit);
    });

    grunt.registerTask('install:npm', 'Set test executable to mb installed through local npm from tarball', function () {
        var done = this.async(),
            tarball = util.format('mountebank-v%s-npm.tar.gz', version);

        fs.removeSync(testDir);
        fs.mkdirSync(testDir);
        fs.copySync('dist/' + tarball, path.join(testDir, tarball));

        run('npm', ['install', './' + tarball], { cwd: testDir }).done(function () {
            process.env.MB_EXECUTABLE = testDir + '/node_modules/.bin/mb';
            done();
        }, process.exit);
    });

    grunt.registerTask('install:pkg', 'Set test executable to mb installed in OSX pkg file', function () {
        var done = this.async(),
            pkg = util.format('mountebank-v%s.pkg', version);

        fs.removeSync(testDir);
        fs.mkdirSync(testDir);
        fs.copySync('dist/' + pkg, path.join(testDir, pkg));

        run('sudo', ['installer', '-pkg', pkg, '-target', '/'], { cwd: testDir }).done(function () {
            process.env.MB_EXECUTABLE = 'mb';
            done();
        }, process.exit);
    });

    grunt.registerTask('install:deb', 'Set test executable to mb installed in Debian file', function () {
        var done = this.async(),
            deb = util.format('mountebank_%s_amd64.deb', version);

        fs.removeSync(testDir);
        fs.mkdirSync(testDir);
        fs.copySync('dist/' + deb, path.join(testDir, deb));

        run('sudo', ['dpkg', '-i', deb], { cwd: testDir }).done(function () {
            process.env.MB_EXECUTABLE = 'mb';
            done();
        }, process.exit);
    });

    grunt.registerTask('uninstall:deb', 'Verify uninstallation of Debian file', function () {
        var done = this.async();

        run('sudo', ['dpkg', '-r', 'mountebank'], { cwd: testDir }).done(function () {
            if (fs.existsSync('/usr/local/bin/mb')) {
                throw 'Uninstalling debian package did not remove /usr/local/bin/mb';
            }
            done();
        }, process.exit);
    });
};
