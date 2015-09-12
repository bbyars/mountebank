'use strict';

var spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    fs = require('fs-extra'),
    os = require('os'),
    path = require('path'),
    thisPackage = require('./package.json'),
    port = process.env.MB_PORT || 2525,
    version = process.env.MB_VERSION || thisPackage.version;

function isWindows () {
    return os.platform().indexOf('win') === 0;
}

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

function forEachFileIn (dir, fileCallback, options) {
    fs.readdirSync(dir).forEach(function (file) {
        var filePath = path.join(dir, file);

        if (!exclude(options.exclude, filePath)) {
            if (fs.lstatSync(filePath).isDirectory()) {
                forEachFileIn(filePath, fileCallback, options);
            } else {
                fileCallback(filePath);
            }
        }
    });
    if (options.after) {
        options.after(dir);
    }
}

module.exports = function (grunt) {

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-mocha-test');

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jshint: {
            all: ['Gruntfile.js', 'src/**/*.js', 'test/**/*.js', 'functionalTest/**/*.js', 'performanceTest/**/*.js', 'bin/mb'],
            options: {
                node: true,
                globals: {
                    describe: false,
                    it: false,
                    before: false,
                    beforeEach: false,
                    after: false,
                    afterEach: false
                },
                newcap: false,
                camelcase: true,
                curly: true,
                eqeqeq: true,
                latedef: true,
                undef: true,
                unused: true,
                trailing: true,
                maxparams: 4,
                maxdepth: 3,
                maxcomplexity: 5
            }
        },
        mochaTest: {
            unit: {
                options: {
                    reporter: 'spec'
                },
                src: ['test/**/*.js']
            },
            functional: {
                options: {
                    reporter: 'spec'
                },
                src: ['functionalTest/**/*.js']
            },
            performance: {
                options: {
                    reporter: 'spec'
                },
                src: ['performanceTest/**/*.js']
            },
            coverage: {
                options: {
                    reporter: 'html-cov',
                    quiet: true,
                    captureFile: 'coverage.html',
                    require: 'coverage/blanket'
                },
                src: ['test/**/*.js']
            }
        }
    });

    grunt.registerTask('mb', 'start or stop mountebank', function (command, executable) {
        command = command || 'start';
        if (['start', 'stop', 'restart'].indexOf(command) === -1) {
            throw 'mb: the only targets are start, restart and stop';
        }

        var done = this.async(),
            calledDone = false,
            options = [command, '--port', port, '--pidfile', 'mb-grunt.pid', '--allowInjection'],
            mb;

        if (isWindows()) {
            options.unshift('dist\\mountebank\\bin\\mb');
            mb = spawn('node', options);
        }
        else {
            executable = executable || 'dist/mountebank/bin/mb';
            console.log('Using ' + executable);
            mb = spawn(executable, options);
        }

        ['stdout', 'stderr'].forEach(function (stream) {
            mb[stream].on('data', function () {
                if (!calledDone) {
                    calledDone = true;
                    done();
                }
            });
        });
    });

    grunt.registerTask('coveralls', 'Send coverage output to coveralls.io', function () {
        var done = this.async(),
            mocha = './node_modules/.bin/mocha --require blanket --reporter mocha-lcov-reporter test/**/*.js',
            command = mocha + ' | ./node_modules/coveralls/bin/coveralls.js';

        exec(command, function (error, stdout, stderr) {
            if (stdout) { console.log(stdout); }
            if (stderr) { console.log(stderr); }
            if (error) { throw error; }
            done();
        });
    });

    grunt.registerTask('dist', 'Create trimmed down distribution directory', function () {
        fs.removeSync('dist');
        fs.mkdirSync('dist');
        fs.mkdirSync('dist/mountebank');
        ['bin', 'src', 'package.json', 'releases.json', 'README.md', 'LICENSE'].forEach(function (source) {
            fs.copySync(source, 'dist/mountebank/' + source);
        });
        fs.removeSync('dist/mountebank/src/public/images/sources');
        exec('cd dist/mountebank && npm install --production', this.async());
    });

    grunt.registerTask('dist:tarball', 'Create OS-specific tarballs', function () {
        var done = this.async(),
            command = 'scripts/dist/createSelfContainedTarball ' + os.platform() + ' x64 ' + version;

        exec(command, { maxBuffer: 2048*2048 }, function () {
            fs.removeSync('dist-test');
            fs.mkdirSync('dist-test');

            fs.readdirSync('dist').forEach(function (filename) {
                if (filename.indexOf('.tar.gz') < 0) {
                    return;
                }

                fs.copySync('dist/' + filename, 'dist-test/' + filename);
                exec('cd dist-test && tar xzvf ' + filename, function () {
                    fs.unlinkSync('dist-test/' + filename);
                    done();
                });
            });
        });
    });

    grunt.registerTask('mbTarball', 'Run mb from extracted OS-specific tarball', function (command) {
        fs.readdirSync('dist').forEach(function (filename) {
            if (filename.indexOf('.tar.gz') < 0) {
                return;
            }

            var mbPath = 'dist-test/' + filename.replace('.tar.gz', '') + '/mb';
            grunt.task.run('mb:' + command + ':' + mbPath);
        });
    });

    grunt.registerTask('version', 'Set the version number', function () {
        var oldPackageJson = fs.readFileSync('package.json', { encoding: 'utf8' }),
            pattern = /"version": "[^"]+"/,
            newPackageJson = oldPackageJson.replace(pattern, '"version": "' + version + '"');

        console.log('Using version ' + version);

        fs.writeFileSync('package.json', newPackageJson);
    });

    grunt.registerTask('wsCheck', 'Check for whitespace problems that make diffing harder', function () {
        var errors = [],
            wsCheck = function (file) {
                var contents = fs.readFileSync(file, 'utf8'),
                    lines = contents.split(os.EOL);

                lines.forEach(function (line) {
                    var trailingWhitespaceErrors = line.match(/\s$/) || [],
                        tabErrors = line.match(/^.*\t.*$/) || [];

                    errors = errors.concat(trailingWhitespaceErrors.map(function () {
                        return file + ' has trailing whitespace\n\t<<' + line + '>>';
                    })).concat(tabErrors.map(function () {
                        return file + ' has tabs instead of spaces\n\t<<' + line + '>>';
                    }));
                });

                if (contents[contents.length-1] !== '\n') {
                    errors = errors.concat(file + ' has no trailing newline');
                }
                else if (contents[contents.length-2] === os.EOL) {
                    errors = errors.concat(file + ' has more than one trailing newline');
                }
            },
            exclusions = ['node_modules', '.git', '.DS_Store', '.idea', 'images', 'dist', 'mountebank.iml', 'mb.log', '*.pid'];

        forEachFileIn('.', wsCheck, { exclude: exclusions });

        if (errors.length > 0) {
            console.error(errors.join(os.EOL));
            process.exit(1);
        }
    });

    grunt.registerTask('jsCheck', 'Run JavaScript checks not covered by jshint', function () {
        var errors = [],
            jsCheck = function (file) {
                var contents = fs.readFileSync(file, 'utf8'),
                    lines = contents.split(os.EOL);

                if (contents.indexOf("'use strict'") < 0) {
                    errors = errors.concat(file + " does not start with 'use strict';");
                }
                lines.forEach(function (line) {
                    var accidentalOnlyErrors = line.match(/(describe|[Ii]t)\.only\(/) || [],
                        functionDeclarationErrors = line.match(/(function [A-Za-z]+\(|function\()/) || [];

                    errors = errors.concat(accidentalOnlyErrors.map(function () {
                        return file + ' appears to have been left with a mocha .only() call\n\t' + line;
                    })).concat(functionDeclarationErrors.map(function () {
                        return file + ' uses function xyz() instead of function xyz () style for function definitions\n\t' + line;
                    }));
                });
            },
            exclusions = ['node_modules', 'dist', 'Gruntfile.js', 'testHelpers.js'];

        forEachFileIn('.', jsCheck, { exclude: exclusions, filetype: '.js' });

        if (errors.length > 0) {
            console.error(errors.join(os.EOL));
            process.exit(1);
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
            exclusions = ['node_modules', '.git', '.DS_Store', '.idea', 'images', 'dist', 'mountebank.iml', 'mb.log'],
            errors = [],
            whitelist = ['npm', 'grunt', 'mocha', 'mocha-lcov-reporter', 'coveralls', 'grunt-cli'];

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
            console.error(errors.join(os.EOL));
            process.exit(1);
        }
    });

    var defaultWarnHandler = grunt.fail.warn;

    grunt.registerTask('try', 'Support continuing beyond failure while still capturing failures', function () {
        grunt.option('force', true);
        grunt.fail.warn = function () {
            grunt.config.set('mb:warning-issued', true);
            defaultWarnHandler.apply(grunt, Array.prototype.slice.call(arguments));
        };
    });

    grunt.registerTask('finally', 'Restore grunt to stop on failure', function () {
        grunt.option('force', false);
        grunt.fail.warn = defaultWarnHandler;
    });

    grunt.registerTask('checkForErrors', 'fail build if any steps executed in a try block failed', function () {
        if(grunt.config('mb:warning-issued')) {
            grunt.fail.warn('Failing from previous errors');
        }
    });

    grunt.registerTask('test:unit', 'Run the unit tests', ['mochaTest:unit']);
    grunt.registerTask('test:functional', 'Run the functional tests',
        ['mb:restart', 'try', 'mochaTest:functional', 'finally', 'mb:stop', 'checkForErrors']);
    grunt.registerTask('test:performance', 'Run the performance tests', ['mochaTest:performance']);
    grunt.registerTask('test', 'Run all non-performance tests', ['test:unit', 'test:functional']);
    grunt.registerTask('coverage', 'Generate code coverage', ['mochaTest:coverage']);
    grunt.registerTask('lint', 'Run all JavaScript lint checks', ['wsCheck', 'jsCheck', 'deadCheck', 'jshint']);
    grunt.registerTask('default', ['version', 'dist', 'test', 'lint']);

    // Package-specific testing
    grunt.registerTask('test:tarball', 'Run tests against packaged tarball',
        ['version', 'dist', 'dist:tarball', 'mbTarball:restart', 'try', 'mochaTest:functional', 'finally', 'mbTarball:stop', 'checkForErrors']);
};
