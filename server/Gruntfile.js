module.exports = function(grunt) {

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jshint: {
            all: ['Gruntfile.js', 'lib/**/*.js', 'test/**/*.js'],
            options: {
                node: true
            }
        },
        nodeunit: {
            all: ['test/**/*.test.js']
        }
    });

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-nodeunit');

    grunt.registerTask('default', ['nodeunit', 'jshint']);

};
