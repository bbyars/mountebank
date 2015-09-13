'use strict';

var spawn = require('child_process').spawn,
    os = require('os'),
    port = process.env.MB_PORT || 2525;

function isWindows () {
    return os.platform().indexOf('win') === 0;
}

module.exports = function (grunt) {
    grunt.registerTask('mb', 'start or stop mountebank', function (command) {
        command = command || 'start';
        if (['start', 'stop', 'restart'].indexOf(command) === -1) {
            throw 'mb: the only targets are start, restart and stop';
        }

        var done = this.async(),
            calledDone = false,
            options = [command, '--port', port, '--pidfile', 'mb-grunt.pid', '--allowInjection', '--mock', '--debug'],
            executable = process.env.MB_EXECUTABLE || 'dist/mountebank/bin/mb',
            mb;

        if (isWindows()) {
            options.unshift(executable);
            mb = spawn('node', options);
        }
        else {
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
};
