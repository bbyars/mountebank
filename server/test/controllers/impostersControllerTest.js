'use strict';

var controller = require('../../src/controllers/impostersController'),
    assert = require('assert'),
    sinon = require('sinon'),
    Imposter = require('../../src/models/imposter');

describe('impostersController', function () {

    describe('#get', function () {
        var response, send;

        beforeEach(function () {
            send = sinon.spy();
            response = {send: send};
        });

        it('should send an empty array if no servers', function () {
            var get = controller.get([]);

            get({}, response);

            assert(send.calledWith({imposters: []}));
        });

        it('should send hypermedia for all servers', function () {
            var firstServer = { hypermedia: function (response) { return "firstHypermedia"; } },
                secondServer = { hypermedia: function (response) { return "secondHypermedia"; } },
                get = controller.get([firstServer, secondServer]);

            get({}, response);

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
                absoluteUrl: function (endpoint) { return 'http://localhost' + endpoint }
            };
        });

        it('should return a 201 with the Location header set', function () {
            var post = controller.post([]);
            request.body.port = 8000;

            post(request, response);

            assert(setHeader.calledWith('Location', 'http://localhost/servers/8000'));
            assert.strictEqual(response.statusCode, 201);
        });;

        it('should return imposter hypermedia', function () {
            var post = controller.post([]),
                imposter = Imposter.create('http', 8000);
            request.body.protocol = 'http'
            request.body.port = 8000;

            post(request, response);

            assert(send.calledWith(imposter.hypermedia(response)));
        });

        it('should add new imposter to list of all imposters', function () {
            var imposters = [],
                post = controller.post(imposters);
            request.body.protocol = 'http';
            request.body.port = 8000;

            post(request, response);

            assert.strictEqual(imposters.length, 1);
        });
    });
});
