'use strict';

var Controller = require('../../src/controllers/impostersController'),
    assert = require('assert'),
    sinon = require('sinon'),
    Imposter = require('../../src/models/imposter');

describe('ImpostersController', function () {

    describe('#get', function () {
        var response, send;

        beforeEach(function () {
            send = sinon.spy();
            response = {send: send};
        });

        it('should send an empty array if no servers', function () {
            var controller = Controller.create({}, []);

            controller.get({}, response);

            assert(send.calledWith({imposters: []}));
        });

        it('should send hypermedia for all servers', function () {
            var firstServer = { hypermedia: function (response) { return "firstHypermedia"; } },
                secondServer = { hypermedia: function (response) { return "secondHypermedia"; } },
                controller = Controller.create({}, [firstServer, secondServer]);

            controller.get({}, response);

            assert(send.calledWith({imposters: ["firstHypermedia", "secondHypermedia"]}));
        });
    });

    describe('#post', function () {
        var request, response, setHeader, send;

        beforeEach(function () {
            request = { body: {} };
            send = sinon.spy();
            setHeader = sinon.spy();
            response = {
                send: send,
                setHeader: setHeader,
                absoluteUrl: function (endpoint) { return 'http://localhost' + endpoint; }
            };
        });

        it('should return a 201 with the Location header set', function () {
            var controller = Controller.create({}, []);
            request.body.port = 8000;

            controller.post(request, response);

            assert(setHeader.calledWith('Location', 'http://localhost/servers/8000'));
            assert.strictEqual(response.statusCode, 201);
        });

        it('should return imposter hypermedia', function () {
            var controller = Controller.create({}, []),
                imposter = Imposter.create('http', 8000);
            request.body.protocol = 'http';
            request.body.port = 8000;

            controller.post(request, response);

            assert(send.calledWith(imposter.hypermedia(response)));
        });

        it('should add new imposter to list of all imposters', function () {
            var imposters = [],
                controller = Controller.create({}, imposters);
            request.body.protocol = 'http';
            request.body.port = 8000;

            controller.post(request, response);

            assert.strictEqual(imposters.length, 1);
        });
    });
});
