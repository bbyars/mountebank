'use strict';

var spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
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

function isWindows () {
    return os.platform().indexOf('win') === 0;
}

function rmdirRecursiveSync (dir) {
    if (!fs.existsSync(dir)) {
        return;
    }

    fs.readdirSync(dir).forEach(function (file) {
        var filePath = path.join(dir, file);
        if (fs.lstatSync(filePath).isDirectory()) {
            rmdirRecursiveSync(filePath);
        } else {
            fs.unlinkSync(filePath);
        }
    });
    fs.rmdirSync(dir);
}

function cpdirRecursiveSync (src, dst) {
    var isDirectory = fs.statSync(src).isDirectory(),
        destination = path.join(dst, path.basename(src));

    if (isDirectory) {
        fs.mkdirSync(destination);
        fs.readdirSync(src).forEach(function (file) {
            cpdirRecursiveSync(path.join(src, file),destination);
        });
    } else {
        fs.linkSync(src, destination);
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

    grunt.registerTask('mb', 'start or stop mountebank', function (command) {
        command = command || 'start';
        if (['start', 'stop', 'restart'].indexOf(command) === -1) {
            throw 'mb: the only targets are start and stop';
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
            mb = spawn('dist/mountebank/bin/mb', options);
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

    grunt.registerTask('jsCheck', 'Run JavaScript checks not covered by jshint', function () {
        shell('scripts/jsCheck', this.async());
    });

    grunt.registerTask('wsCheck', 'Check for inconsistent whitespace', function () {
        shell('scripts/wsCheck', this.async());
    });

    grunt.registerTask('version', 'Set the version number', function () {
        var oldPackageJson = fs.readFileSync('package.json', { encoding: 'utf8' }),
            pattern = /"version": "(\d+)\.(\d+)\.(\d+)"/,
            newPackageJson = oldPackageJson.replace(pattern, '"version": "$1.$2.' + revision + '"');

        console.log("Using revision " + revision);

        fs.writeFileSync('package.json', newPackageJson);
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
        rmdirRecursiveSync('dist');
        fs.mkdirSync('dist');
        fs.mkdirSync('dist/mountebank');
        ['bin', 'src', 'package.json', 'README.md', 'LICENSE'].forEach(function (source) {
            cpdirRecursiveSync(source, 'dist/mountebank');
        });
        rmdirRecursiveSync('dist/mountebank/src/public/images/sources');
        exec('cd dist/mountebank && npm install --production', this.async());
    });

    grunt.registerTask('test:unit', 'Run the unit tests', ['mochaTest:unit']);
    grunt.registerTask('test:functional', 'Run the functional tests', ['dist', 'mb:restart', 'mochaTest:functional', 'mb:stop']);
    grunt.registerTask('test:performance', 'Run the performance tests', ['mochaTest:performance']);
    grunt.registerTask('test', 'Run all non-performance tests', ['test:unit', 'test:functional']);
    grunt.registerTask('coverage', 'Generate code coverage', ['mochaTest:coverage']);
    grunt.registerTask('lint', 'Run all JavaScript lint checks', ['wsCheck', 'jsCheck', 'jshint']);
    grunt.registerTask('default', ['version', 'test', 'lint']);
};
