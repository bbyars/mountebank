'use strict';

const Controller = require('../../src/controllers/feedController'),
    assert = require('assert'),
    mock = require('../mock').mock;

describe('feedController', function () {
    describe('#getRelease', function () {
        it('should prevent path traversal attacks', function () {
            const response = { status: mock().returns({ send: mock() }) },
                releases = [{ version: 'v2.3.0', date: '2020-09-07' }],
                controller = Controller.create(releases, { heroku: false }),
                request = {
                    headers: { host: 'localhost' },
                    params: { version: 'v2.3.0%2f..%2f..%2f_header' }
                };

            controller.getRelease(request, response);

            assert.ok(response.status.wasCalledWith(404));
        });
    });
});
