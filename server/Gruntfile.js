'use strict';

var spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    os = require('os'),
    port = process.env.MB_PORT || 2525,
    revision = process.env.REVISION || 0;

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
                }
            }
        },
        mochaTest: {
            unit: {
                options: {
                    reporter: 'spec'
                    /*,
                    This breaks some of the mock tests
                    require: 'coverage/blanket'
                    */
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
                    captureFile: 'coverage.html'
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
            mb = spawn('bin/mb', [command, '--port', port, '--pidfile', 'mb-grunt.pid']);

        ['stdout', 'stderr'].forEach(function (stream) {
            mb[stream].on('data', function (data) {
                if (!calledDone) {
                    calledDone = true;
                    done();
                }
            });
        });
    });

    grunt.registerTask('jsCheck', 'Run JavaScript checks not covered by jshint', function () {
        var done = this.async();

        exec('bin/jsCheck', function (error) {
            if (error) {
                throw error;
            }
            done();
        });
    });

    grunt.registerTask('version', 'Set the version number', function () {
        var done = this.async(),
            pattern = '"version": "([0-9]+)\\.([0-9]+)\\.([0-9]+)"',
            replacement = '"version": "\\1.\\2.' + revision + '"',
            sed = "sed -E -e 's/" + pattern + "/" + replacement + "/' ";// package.json";

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

    grunt.registerTask('test:unit', 'Run the unit tests', ['mochaTest:unit']);
    grunt.registerTask('test:functional', 'Run the functional tests', ['mb:restart', 'mochaTest:functional', 'mb:stop']);
    grunt.registerTask('test', 'Run all tests', ['test:unit', 'test:functional']);
    grunt.registerTask('lint', 'Run all JavaScript lint checks', ['jsCheck', 'jshint']);
    grunt.registerTask('default', ['version', 'test', 'lint']);
};
