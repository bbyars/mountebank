'use strict';

var fs = require('fs-extra'),
    path = require('path'),
    exec = require('child_process').exec,
    os = require('os'),
    semver = require('semver'),
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

function addShonkwrapErrors (dependencies, errors) {
    Object.keys(dependencies).forEach(function (npmPackage) {
        if (dependencies[npmPackage].from || dependencies[npmPackage].resolved) {
            errors.push('Package "' + npmPackage + '" has repo information in npm-shrinkwrap.json. This causes issues hosting mountebank in an internal repo manager. Run node_modules/.bin/shonkwrap to fix');
        }
        if (dependencies[npmPackage].dependencies) {
            addShonkwrapErrors(dependencies[npmPackage].dependencies, errors);
        }
    });
}

module.exports = function (grunt) {

    grunt.registerTask('shonkwrapCheck', 'Confirm that all packages have been shonkwrapped', function () {
        var shrinkwrap = require('../npm-shrinkwrap.json'),
            errors = [];

        if (thisPackage.version !== shrinkwrap.version) {
            errors.push('npm-shrinkwrap.json version does not match package.json version');
        }

        Object.keys(thisPackage.dependencies).forEach(function (npmPackage) {
            var version = thisPackage.dependencies[npmPackage],
                shrinkwrapDep = shrinkwrap.dependencies[npmPackage];

            if (!shrinkwrapDep) {
                errors.push('Package "' + npmPackage + '" missing from npm-shrinkwrap.json. Run node_modules/.bin/shonkwrap');
            }
            else if (!semver.satisfies(shrinkwrapDep.version, version)) {
                errors.push('Package "' + npmPackage + '" version is incorrect in npm-shrinkwrap.json. Run node_modules/.bin/shonkwrap');
            }
        });

        addShonkwrapErrors(shrinkwrap.dependencies, errors);

        if (errors.length > 0) {
            errors.push('Unforunately, shrinkwrap/shonkwrap functionality is a little buggy, with unhelpful error messages (see https://github.com/npm/npm/issues/4435)');
            errors.push("When it's failed for me in the past, it's been because of mismatched versions in package.json and npm-shrinkwrap.json");
            errors.push("The best solution I've found is to rm npm-shrinkwrap.json && npm install && npm prune && node_modules/.bin/shonkwrap");
            errors.push("Sorry, I know it's a pain in the arse, but as written, this will fail in certain conditions under an npm install");
            errors.push("If you know an easier way to pin versions and host in internal repos, I'm all ears ;>");
            grunt.warn(errors.join(os.EOL));
        }
    });

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
            whitelist = ['grunt', 'mocha', 'istanbul', 'coveralls', 'grunt-cli', 'jsdoc', 'grunt-contrib-csslint', 'shonkwrap'];

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
            command = './node_modules/.bin/istanbul cover grunt mochaTest:unit';

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
            mocha = './node_modules/.bin/istanbul cover grunt mochaTest:unit',
            command = mocha + ' && cat ./coverage/lcov.info | ./node_modules/coveralls/bin/coveralls.js';

        exec(command, function (error, stdout, stderr) {
            if (stdout) { console.log(stdout); }
            if (stderr) { console.log(stderr); }
            if (error) { throw error; }
            done();
        });
    });
};
