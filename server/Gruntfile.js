'use strict';

var spawn = require('child_process').spawn,
    port = process.env.MB_PORT || 2525;

module.exports = function(grunt) {

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

    grunt.registerTask('test:unit', 'Run the unit tests', ['mochaTest:unit']);
    grunt.registerTask('test:functional', 'Run the functional tests', ['mb:restart', 'mochaTest:functional', 'mb:stop']);
    grunt.registerTask('test', 'Run all tests', ['test:unit', 'test:functional']);
    grunt.registerTask('default', ['test', 'jshint']);
};
