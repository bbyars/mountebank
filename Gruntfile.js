'use strict';

var spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    os = require('os'),
    port = process.env.MB_PORT || 2525,
    revision = process.env.REVISION || 0;

function shell (command, done) {
    exec(command, function (error) {
        if (error) {
            throw error;
        }
        done();
    });
}

module.exports = function (grunt) {

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-mocha-test');

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jshint: {
            all: ['Gruntfile.js', 'src/**/*.js', 'test/**/*.js', 'functionalTest/**/*.js', 'bin/mb'],
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

    grunt.registerTask('mb', 'start or stop mountebank', function (command) {
        command = command || 'start';
        if (['start', 'stop', 'restart'].indexOf(command) === -1) {
            throw 'mb: the only targets are start and stop';
        }

        var done = this.async(),
            calledDone = false,
            mb = spawn('bin/mb', [command, '--port', port, '--pidfile', 'mb-grunt.pid', '--allowInjection']);

        ['stdout', 'stderr'].forEach(function (stream) {
            mb[stream].on('data', function () {
                if (!calledDone) {
                    calledDone = true;
                    done();
                }
            });
        });
    });

    grunt.registerTask('jsCheck', 'Run JavaScript checks not covered by jshint', function () {
        shell('bin/jsCheck', this.async());
    });

    grunt.registerTask('wsCheck', 'Check for inconsistent whitespace', function () {
        shell('bin/wsCheck', this.async());
    });

    grunt.registerTask('version', 'Set the version number', function () {
        var done = this.async(),
            pattern = '"version": "([0-9]+)\\.([0-9]+)\\.([0-9]+)"',
            replacement = '"version": "\\1.\\2.' + revision + '"',
            sed = "sed -E -e 's/" + pattern + "/" + replacement + "/' ";

        console.log("Using " + revision);

        if (os.platform() === 'darwin') {
            sed += "-i '' package.json";
        }
        else {
            sed += "-i'' package.json";
        }

        exec(sed, function (error) {
            if (error) {
                throw error;
            }
            done();
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

    grunt.registerTask('test:unit', 'Run the unit tests', ['mochaTest:unit']);
    grunt.registerTask('test:functional', 'Run the functional tests', ['mb:restart', 'mochaTest:functional', 'mb:stop']);
    grunt.registerTask('test', 'Run all tests', ['test:unit', 'test:functional']);
    grunt.registerTask('coverage', 'Generate code coverage', ['mochaTest:coverage']);
    grunt.registerTask('lint', 'Run all JavaScript lint checks', ['wsCheck', 'jsCheck', 'jshint']);
    grunt.registerTask('default', ['version', 'test', 'lint']);
};
