'use strict';

var assert = require('assert'),
    http = require('http'),
    Q = require('q');

var api = {
    get: function get (path) {
        var deferred = Q.defer(),
            options = {
                hostname: 'localhost',
                port: 2525,
                path: path,
                method: 'GET',
                headers: {
                    accept: 'application/json'
                }
            };

        var request = http.request(options, function (response) {
            response.body = '';
            response.setEncoding('utf8');
            response.on('data', function (chunk) {
                response.body += chunk;
            });
            response.on('end', function () {
                response.body = JSON.parse(response.body);
                deferred.resolve(response);
            })
        });

        request.on('error', function (error) {
            console.log(error.message);
            deferred.reject();
        });
        request.end();
        return deferred.promise;
    }
};

describe('homeController', function () {
    describe('GET /', function () {
        it('should return hypermedia', function (done) {
            api.get('/').then(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.deepEqual(response.body, {
                    links: [
                        {
                            href: "http://localhost:2525/imposters",
                            rel: "imposters"
                        }
                    ]
                });
                done();
            });
        });
    });
});
