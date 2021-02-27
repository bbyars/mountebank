'use strict';

const fs = require('fs-extra'),
    os = require('os'),
    version = require('./version').getVersion(),
    run = require('./run').run;

module.exports = function (grunt) {
    grunt.registerTask('dist', 'Create trimmed down distribution directory', async function () {
        const done = this.async(),
            newPackage = JSON.parse(JSON.stringify(require('../package.json')));

        fs.removeSync('dist');
        fs.mkdirSync('dist');
        fs.mkdirSync('dist/mountebank');
        ['bin', 'src', 'package.json', 'package-lock.json', 'releases.json', 'README.md', 'LICENSE'].forEach(source => {
            fs.copySync(source, 'dist/mountebank/' + source);
        });

        delete newPackage.devDependencies;
        fs.writeFileSync('dist/mountebank/package.json', JSON.stringify(newPackage, null, 2));

        try {
            await run('npm', ['install', '--production'], { cwd: 'dist/mountebank' });

            // Switch tests to use the mb from the dist directory to test what actually gets published
            process.env.MB_EXECUTABLE = 'dist/mountebank/bin/mb';
            done();
        }
        catch (exitCode) {
            grunt.warn('dist failed', exitCode);
        }
    });

    grunt.registerTask('version', 'Set the version number', function () {
        const newPackage = require('../package.json');

        newPackage.version = version;
        console.log('Using version ' + version);
        fs.writeFileSync('./dist/mountebank/package.json', JSON.stringify(newPackage, null, 2) + '\n');
    });

    grunt.registerTask('dist:tarball', 'Create OS-specific tarballs', async function (arch) {
        const done = this.async();

        try {
            await run('scripts/dist/createSelfContainedTarball', [os.platform(), arch || os.arch(), version]);
            done();
        }
        catch (exitCode) {
            grunt.warn('dist:tarball failed', exitCode);
        }
    });

    grunt.registerTask('dist:zip', 'Create OS-specific zips', async function (arch) {
        const done = this.async();

        try {
            await run('scripts/dist/createWindowsZip', [arch, version]);
            done();
        }
        catch (exitCode) {
            grunt.warn('dist:zip failed', exitCode);
        }
    });

    grunt.registerTask('dist:npm', 'Create npm tarball', async function () {
        const filename = 'mountebank-v' + version + '-npm.tar.gz',
            done = this.async();

        try {
            await run('tar', ['czf', filename, 'mountebank'], { cwd: 'dist' });
            done();
        }
        catch (exitCode) {
            grunt.warn('dist:npm failed', exitCode);
        }
    });

    grunt.registerTask('dist:package', 'Create OS-specific package', async function (type) {
        const done = this.async();

        try {
            await run('scripts/dist/createPackage', [os.platform(), type, version]);
            done();
        }
        catch (exitCode) {
            grunt.warn('dist:package failed', exitCode);
        }
    });
};
