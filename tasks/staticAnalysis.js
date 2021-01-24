'use strict';

const fs = require('fs-extra'),
    path = require('path'),
    exec = require('child_process').exec,
    os = require('os');

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
    fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);

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

    grunt.registerTask('onlyCheck', 'Look for accidental mocha .only calls', function () {
        let errors = [],
            check = function (file) {
                const contents = fs.readFileSync(file, 'utf8'),
                    lines = contents.split(os.EOL);

                lines.forEach(function (line) {
                    const accidentalOnlyErrors = line.match(/(describe|[Ii]t)\.only\(/) || [];

                    errors = errors.concat(accidentalOnlyErrors.map(function () {
                        return file + ' appears to have been left with a mocha .only() call\n\t' + line;
                    }));
                });
            },
            exclusions = ['node_modules', 'dist', 'staticAnalysis.js', '*.pid', 'jquery', 'docs', '*.csv'];

        forEachFileIn('.', check, { exclude: exclusions, filetype: '.js' });

        if (errors.length > 0) {
            grunt.warn(errors.join(os.EOL));
        }
    });

    grunt.registerTask('objectCheck', 'Look for accidental use of typeof x === "object"', function () {
        let errors = [],
            check = function (file) {
                const contents = fs.readFileSync(file, 'utf8');
                if (contents.indexOf("=== 'object'") > 0) {
                    errors.push(`${file} appears to do a typecheck against object without using helpers.isObject`);
                }
            },
            exclusions = ['node_modules', 'dist', 'functionalTest', 'staticAnalysis.js', 'helpers.js', '*.pid', 'jquery', 'docs', '*.csv'];

        forEachFileIn('.', check, { exclude: exclusions, filetype: '.js' });

        if (errors.length > 0) {
            grunt.warn(errors.join(os.EOL));
        }
    });

    grunt.registerTask('jsCheck', 'Run JavaScript checks not covered by eslint', ['onlyCheck', 'objectCheck']);

    grunt.registerTask('deadCheck', 'Check for unused dependencies in package.json', function () {
        const thisPackage = require('../package.json'),
            dependencies = Object.keys(thisPackage.dependencies).concat(Object.keys(thisPackage.devDependencies)),
            usedCount = {},
            dependencyCheck = file => {
                const contents = fs.readFileSync(file, 'utf8');

                dependencies.forEach(dependency => {
                    if (contents.indexOf("require('" + dependency) >= 0 ||
                        contents.indexOf("loadNpmTasks('" + dependency + "')") >= 0) {
                        usedCount[dependency] += 1;
                    }
                });
            },
            exclusions = ['node_modules', 'docs', '.git', '.DS_Store', '.idea', 'images', 'dist', 'mountebank.iml', 'mb.log', '*.pid', 'package-lock.json', '*.csv'],
            errors = [],
            whitelist = [
                'grunt',
                'mocha',
                'istanbul',
                'grunt-cli',
                'jsdoc',
                'grunt-contrib-csslint',
                'firebase-tools',
                'nc',
                'snyk',
                'mountebank-formatters',
                'eslint-plugin-node'
            ];

        dependencies.forEach(dependency => { usedCount[dependency] = 0; });
        whitelist.forEach(dependency => { usedCount[dependency] += 1; });

        forEachFileIn('.', dependencyCheck, { exclude: exclusions });

        dependencies.forEach(dependency => {
            if (usedCount[dependency] === 0) {
                errors.push(dependency + ' is depended on in package.json but is never required');
            }
        });

        if (errors.length > 0) {
            grunt.warn(errors.join(os.EOL));
        }
    });

    grunt.registerTask('coverage', 'Generate code coverage', function () {
        const done = this.async(),
            command = 'node_modules/.bin/istanbul cover node_modules/.bin/grunt mochaTest:unit';

        exec(command, function (error, stdout, stderr) {
            if (stdout) { console.log(stdout); }
            if (stderr) { console.log(stderr); }
            if (error) { throw error; }
            console.log('Coverage report at coverage/lcov-report/index.html');
            done();
        });
    });

    grunt.registerTask('codeclimate', 'Send coverage results to codeclimate', function () {
        const done = this.async(),
            command = 'scripts/codeclimate';

        exec(command, function (error, stdout, stderr) {
            if (stdout) { console.log(stdout); }
            if (stderr) { console.log(stderr); }
            if (error) { throw error; }
            done();
        });
    });

    grunt.registerTask('sonar', 'Run SonarQube', function () {
        const done = this.async(),
            command = 'scripts/sonar';

        exec(command, function (error, stdout, stderr) {
            if (stdout) { console.log(stdout); }
            if (stderr) { console.log(stderr); }
            if (error) { throw error; }
            done();
        });
    });

    grunt.registerTask('licenseCheck', 'Check for restrictive licenses', function () {
        var done = this.async(),
            checker = require('license-checker'),
            validLicenses = ['MIT', 'ISC', 'Apache', 'BSD'];

        checker.init({
            start: path.join(__dirname, '..'),
            production: true
        }, function (err, packages) {
            if (err) {
                throw err;
            }
            else {
                const failures = {};
                Object.keys(packages).forEach(name => {
                    const supported = validLicenses.some(license => {
                        return packages[name].licenses.indexOf(license) >= 0;
                    });
                    if (!supported) {
                        failures[name] = packages[name];
                    }
                });
                if (Object.keys(failures).length > 0) {
                    console.error(JSON.stringify(failures, null, 2));
                    grunt.warn('The licenses above are not accepted. Either change the dependency or add the license to the valid list.');
                }
                done();
            }
        });
    });
};
