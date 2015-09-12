'use strict';

var fs = require('fs-extra'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version;

module.exports = function (grunt) {
    grunt.registerTask('version', 'Set the version number', function () {
        var oldPackageJson = fs.readFileSync('package.json', { encoding: 'utf8' }),
            pattern = /"version": "[^"]+"/,
            newPackageJson = oldPackageJson.replace(pattern, '"version": "' + version + '"');

        console.log('Using version ' + version);

        fs.writeFileSync('package.json', newPackageJson);
    });
};
