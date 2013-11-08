'use strict';

var assert = require('assert'),
    http = require('http'),
    api = require('./api');

describe('homeController', function () {
    describe('GET /', function () {
        it('should return hypermedia', function (done) {
            api.get('/').then(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.deepEqual(response.body, {
                    links: [
                        {
                            href: api.url + "/imposters",
                            rel: "imposters"
                        }
                    ]
                });
                done();
            });
        });
    });
});
