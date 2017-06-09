'use strict';

var fs = require('fs-extra'),
    path = require('path'),
    exec = require('child_process').exec,
    os = require('os'),
    thisPackage = require('../package.json');

function exclude (exclusions, file) {
    return (exclusions || []).some(function (exclusion) {
        if (exclusion[0] === '*') {
            return path.extname(file) === exclusion.substring(1);
        }
        else {
            return path.basename(file) === exclusion;
        }
    });
}

function include (filetype, file) {
    return !filetype || file.indexOf(filetype, file.length - filetype.length) >= 0;
}

function forEachFileIn (dir, fileCallback, options) {
    fs.readdirSync(dir).forEach(function (file) {
        var filePath = path.join(dir, file);

        if (!exclude(options.exclude, filePath)) {
            if (fs.lstatSync(filePath).isDirectory()) {
                forEachFileIn(filePath, fileCallback, options);
            }
            else if (include(options.filetype, filePath)) {
                fileCallback(filePath);
            }
        }
    });
}

module.exports = function (grunt) {

    grunt.registerTask('jsCheck', 'Run JavaScript checks not covered by eslint', function () {
        var errors = [],
            jsCheck = function (file) {
                var contents = fs.readFileSync(file, 'utf8'),
                    lines = contents.split(os.EOL);

                lines.forEach(function (line) {
                    var accidentalOnlyErrors = line.match(/(describe|[Ii]t)\.only\(/) || [];

                    errors = errors.concat(accidentalOnlyErrors.map(function () {
                        return file + ' appears to have been left with a mocha .only() call\n\t' + line;
                    }));
                });
            },
            exclusions = ['node_modules', 'dist', 'staticAnalysis.js', 'testHelpers.js', '*.pid', 'jquery', 'docs'];

        forEachFileIn('.', jsCheck, { exclude: exclusions, filetype: '.js' });

        if (errors.length > 0) {
            grunt.warn(errors.join(os.EOL));
        }
    });

    grunt.registerTask('deadCheck', 'Check for unused dependencies in package.json', function () {
        var dependencies = Object.keys(thisPackage.dependencies).concat(Object.keys(thisPackage.devDependencies)),
            usedCount = {},
            dependencyCheck = function (file) {
                var contents = fs.readFileSync(file, 'utf8');

                dependencies.forEach(function (dependency) {
                    if (contents.indexOf("require('" + dependency + "')") >= 0 ||
                        contents.indexOf("loadNpmTasks('" + dependency + "')") >= 0) {
                        usedCount[dependency] += 1;
                    }
                });
            },
            exclusions = ['node_modules', '.git', '.DS_Store', '.idea', 'images', 'dist', 'mountebank.iml', 'mb.log', '*.pid'],
            errors = [],
            whitelist = [
                'grunt',
                'mocha',
                'istanbul',
                'coveralls',
                'grunt-cli',
                'jsdoc',
                'grunt-contrib-csslint',
                'shonkwrap',
                'codeclimate-test-reporter',
                'firebase-tools'
            ];

        dependencies.forEach(function (dependency) {
            usedCount[dependency] = 0;
        });
        whitelist.forEach(function (dependency) {
            usedCount[dependency] += 1;
        });

        forEachFileIn('.', dependencyCheck, { exclude: exclusions });

        dependencies.forEach(function (dependency) {
            if (usedCount[dependency] === 0) {
                errors.push(dependency + ' is depended on in package.json but is never required');
            }
        });

        if (errors.length > 0) {
            grunt.warn(errors.join(os.EOL));
        }
    });

    grunt.registerTask('coverage', 'Generate code coverage', function () {
        var done = this.async(),
            command = 'node_modules/.bin/istanbul cover node_modules/.bin/grunt mochaTest:unit';

        exec(command, function (error, stdout, stderr) {
            if (stdout) { console.log(stdout); }
            if (stderr) { console.log(stderr); }
            if (error) { throw error; }
            console.log('Coverage report at coverage/lcov-report/index.html');
            done();
        });
    });

    grunt.registerTask('coveralls', 'Send coverage output to coveralls.io', function () {
        var done = this.async(),
            mocha = 'node_modules/.bin/istanbul cover node_modules/.bin/_mocha --report lcovonly test/**/*.js -- -R spec',
            command = mocha + ' && cat coverage/lcov.info | node_modules/coveralls/bin/coveralls.js';

        exec(command, function (error, stdout, stderr) {
            if (stdout) { console.log(stdout); }
            if (stderr) { console.log(stderr); }
            if (error) { throw error; }
            done();
        });
    });

    grunt.registerTask('_codeclimate', 'Send coverage results to codeclimate', function () {
        var done = this.async(),
            command = 'node_modules/.bin/codeclimate-test-reporter < coverage/lcov.info';

        exec(command, function (error, stdout, stderr) {
            if (stdout) { console.log(stdout); }
            if (stderr) { console.log(stderr); }
            if (error) { throw error; }
            done();
        });
    });

    grunt.registerTask('codeclimate', 'Send coverage results to codeclimate', ['coverage', '_codeclimate']);
};
