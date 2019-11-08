'use strict';

const fs = require('fs-extra'),
    os = require('os'),
    version = require('./version').getVersion(),
    run = require('./run').run;

module.exports = function (grunt) {

    function failTask (task) {
        return exitCode => {
            grunt.warn(task + ' failed', exitCode);
        };
    }

    grunt.registerTask('dist', 'Create trimmed down distribution directory', function () {
        const done = this.async(),
            newPackage = JSON.parse(JSON.stringify(require('../package.json'))),
            failed = failTask('dist');

        fs.removeSync('dist');
        fs.mkdirSync('dist');
        fs.mkdirSync('dist/mountebank');
        ['bin', 'src', 'package.json', 'package-lock.json', 'releases.json', 'README.md', 'LICENSE'].forEach(source => {
            fs.copySync(source, 'dist/mountebank/' + source);
        });
        fs.removeSync('dist/mountebank/src/public/images/sources');


        delete newPackage.devDependencies;
        fs.writeFileSync('dist/mountebank/package.json', JSON.stringify(newPackage, null, 2));

        run('npm', ['install', '--production'], { cwd: 'dist/mountebank' }).done(() => {
            // Switch tests to use the mb from the dist directory to test what actually gets published
            process.env.MB_EXECUTABLE = 'dist/mountebank/bin/mb';
            done();
        }, failed);
    });

    grunt.registerTask('version', 'Set the version number', function () {
        const newPackage = require('../dist/mountebank/package.json');

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
        const filename = 'mountebank-v' + version + '-npm.tar.gz';

        run('tar', ['czf', filename, 'mountebank'], { cwd: 'dist' }).done(this.async(), failTask('dist:npm'));
    });

    grunt.registerTask('dist:package', 'Create OS-specific package', function (type) {
        run('scripts/dist/createPackage', [os.platform(), type, version]).done(this.async(), failTask('dist:package'));
    });
};
