'use strict';

var fs = require('fs-extra'),
    thisPackage = require('../package.json'),
    version = process.env.MB_VERSION || thisPackage.version;

module.exports = function (grunt) {
    grunt.registerTask('version', 'Set the version number', function () {
        var newPackage = JSON.parse(JSON.stringify(thisPackage));

        newPackage.version = version;
        console.log('Using version ' + version);
        fs.writeFileSync('package.json', JSON.stringify(newPackage, null, 2) + '\n');
    });
};
