'use strict';

var port = process.env.MB_PORT || 2525;

module.exports = function (grunt) {

    require('time-grunt')(grunt);

    grunt.loadTasks('tasks');
    grunt.loadNpmTasks('grunt-mocha-test');
    grunt.loadNpmTasks('grunt-jsdoc');
    grunt.loadNpmTasks('grunt-mountebank');
    grunt.loadNpmTasks('grunt-eslint');
    grunt.loadNpmTasks('grunt-css');

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'), // needed for coveralls
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
            }
        },
        eslint: {
            target: [
                'Gruntfile.js',
                'src/**/*.js',
                'tasks/**/*.js',
                'test/**/*.js',
                'functionalTest/**/*.js',
                'performanceTest/**/*.js',
                'bin/mb'
            ]
        },
        jsdoc: {
            dist: {
                src: ['src/**/*.js'],
                options: {
                    destination: 'docs',
                    configure: '.jsdoc',
                    pedantic: true,
                    readme: 'CONTRIBUTING.md',
                    package: 'dist/mountebank/package.json' // use dist to get correct version
                }
            }
        },
        mb: {
            options: {
                path: 'bin/mb',
                pathEnvironmentVariable: 'MB_EXECUTABLE'
            },
            restart: ['--port', port, '--pidfile', 'mb-grunt.pid', '--logfile', 'mb-grunt.log', '--allowInjection', '--mock', '--debug'],
            stop: ['--pidfile', 'mb-grunt.pid']
        },
        csslint: {
            strict: {
                options: {
                    important: 2,
                    ids: 2
                },
                all: [
                    'src/**/*.css',
                    '!src/**/jquery-ui.css'
                ]
            }
        }
    });

    grunt.registerTask('setAirplaneMode', function () {
        process.env.MB_AIRPLANE_MODE = 'true';
    });

    grunt.registerTask('test:unit', 'Run the unit tests', ['mochaTest:unit']);
    grunt.registerTask('test:functional', 'Run the functional tests',
        ['mb:restart', 'try', 'mochaTest:functional', 'finally', 'mb:stop', 'checkForErrors']);
    grunt.registerTask('test:performance', 'Run the performance tests', ['mochaTest:performance']);
    grunt.registerTask('test', 'Run all non-performance tests', ['test:unit', 'test:functional']);
    grunt.registerTask('lint', 'Run all lint checks', ['jsCheck', 'deadCheck', 'eslint']);
    grunt.registerTask('default', ['test', 'lint']);
    grunt.registerTask('airplane', 'Build that avoids tests requiring network access', ['setAirplaneMode', 'default']);

    // Package-specific testing
    grunt.registerTask('test:tarball:x64', 'Run tests against packaged tarball',
        ['dist', 'version', 'dist:tarball:x64', 'install:tarball:x64', 'test', 'lint']);
    grunt.registerTask('test:zip', 'Run tests against packaged zipfile',
        ['download:zip', 'install:zip', 'test', 'lint']);
    grunt.registerTask('test:npm', 'Run tests against npm package',
        ['dist', 'version', 'dist:npm', 'install:npm', 'test']);
    grunt.registerTask('test:pkg', 'Run tests against OSX pkg file',
        ['dist', 'version', 'dist:package:osxpkg', 'install:pkg', 'test']);
    grunt.registerTask('test:deb', 'Run tests against Debian package',
        ['dist', 'version', 'dist:package:deb', 'install:deb', 'test', 'uninstall:deb']);
    grunt.registerTask('test:rpm', 'Run tests against Red Hat package',
        ['download:rpm', 'install:rpm', 'test', 'uninstall:rpm']);

    // Second stage
    grunt.registerTask('verify:windows', 'Wait for the appveyor build to finish',
        ['download:appveyor', 'waitFor:appveyor']);
};
