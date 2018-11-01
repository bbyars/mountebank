'use strict';

const port = process.env.MB_PORT || 2525;

module.exports = grunt => {

    require('time-grunt')(grunt);

    grunt.loadTasks('tasks');
    grunt.loadNpmTasks('grunt-mocha-test');
    grunt.loadNpmTasks('grunt-jsdoc');
    grunt.loadNpmTasks('grunt-mountebank');
    grunt.loadNpmTasks('grunt-eslint');
    grunt.loadNpmTasks('grunt-css');

    grunt.initConfig({
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
            functionalFoo: {
                options: { reporter: 'spec' },
                src: ['functionalTest/api/foo/**/*.js']
            },
            functionalHttp: {
                options: { reporter: 'spec' },
                src: ['functionalTest/api/http/**/*.js']
            },
            functionalHttps: {
                options: { reporter: 'spec' },
                src: ['functionalTest/api/https/**/*.js']
            },
            functionalSmtp: {
                options: { reporter: 'spec' },
                src: ['functionalTest/api/smtp/**/*.js']
            },
            functionalTcp: {
                options: { reporter: 'spec' },
                src: ['functionalTest/api/tcp/**/*.js']
            },
            functionalApi: {
                options: { reporter: 'spec' },
                src: ['functionalTest/api/*.js']
            },
            functionalCli: {
                options: { reporter: 'spec' },
                src: ['functionalTest/commandLine/**/*.js']
            },
            functionalHtml: {
                options: { reporter: 'spec' },
                src: ['functionalTest/html/**/*.js']
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

    grunt.registerTask('setAirplaneMode', () => {
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

    // Windows workaround; I have been unable to debug why I get ECONNRESET errors on Windows test runs
    // of test:functional, so instead I'm cheating by breaking up the test run. With a full test:functional
    // test run on Windows, I get an ECONNRESET error after around ~580 http/s requests from the functional
    // tests. It appears to be deterministic, it will be the same test that starts failing as long as you maintain
    // the order that the tests run in. However, that test works by itself, and will pass if you move it up in
    // the order of the tests.
    ['Foo', 'Http', 'Https', 'Smtp', 'Tcp', 'Api', 'Cli', 'Html'].forEach(key => {
        grunt.registerTask('test:functional' + key,
            ['mb:restart', 'try', 'mochaTest:functional' + key, 'finally', 'mb:stop', 'checkForErrors']);
    });

    // Package-specific testing
    grunt.registerTask('test:tarball:x64', 'Run tests against packaged tarball',
        ['dist:tarball:x64', 'install:tarball:x64', 'test:functional']);
    grunt.registerTask('test:zip', 'Run tests against packaged zipfile',
        ['download:zip', 'install:zip', 'test']);
    grunt.registerTask('test:npm', 'Run tests against npm package',
        ['dist:npm', 'install:npm', 'test:functional']);
    grunt.registerTask('test:pkg', 'Run tests against OSX pkg file',
        ['dist', 'version', 'dist:package:osxpkg', 'install:pkg', 'test']);
    grunt.registerTask('test:deb', 'Run tests against Debian package',
        ['dist:package:deb', 'install:deb', 'test:functional']);
    grunt.registerTask('test:rpm', 'Run tests against Red Hat package',
        ['dist:package:rpm', 'install:rpm', 'test:functional']);
};
