'use strict';

const Controller = require('../../src/controllers/logsController'),
    assert = require('assert'),
    fs = require('fs'),
    FakeResponse = require('../fakes/fakeResponse');

describe('logsController', function () {
    describe('#get', function () {
        after(() => {
            fs.unlinkSync('logsControllerTest.log');
        });

        it('should return full contents of logfile as JSON array by default', function () {
            const response = FakeResponse.create(),
                controller = Controller.create('logsControllerTest.log');

            fs.writeFileSync('logsControllerTest.log', '{"key": "first"}\n{"key": "second"}\n');
            controller.get({ url: '/logs' }, response);

            assert.deepEqual(response.body, {
                logs: [
                    { key: 'first' },
                    { key: 'second' }
                ]
            });
        });

        it('should return entries starting with startIndex', function () {
            const response = FakeResponse.create(),
                controller = Controller.create('logsControllerTest.log');

            fs.writeFileSync('logsControllerTest.log', '{"key": "first"}\n{"key": "second"}\n{"key": "third"}');
            controller.get({ url: '/logs?startIndex=1' }, response);

            assert.deepEqual(response.body, {
                logs: [
                    { key: 'second' },
                    { key: 'third' }
                ]
            });
        });

        it('should return entries starting with startIndex and ending with endIndex', function () {
            const response = FakeResponse.create(),
                controller = Controller.create('logsControllerTest.log');

            fs.writeFileSync('logsControllerTest.log', '{"key": "first"}\n{"key": "second"}\n{"key": "third"}');
            controller.get({ url: '/logs?startIndex=0&endIndex=1' }, response);

            assert.deepEqual(response.body, {
                logs: [
                    { key: 'first' },
                    { key: 'second' }
                ]
            });
        });
    });
});
