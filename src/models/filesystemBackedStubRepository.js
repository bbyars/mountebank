'use strict';

function writeFile (filepath, obj) {
    const fs = require('fs-extra'),
        path = require('path'),
        Q = require('q'),
        dir = path.dirname(filepath),
        deferred = Q.defer();

    fs.ensureDir(dir, mkdirErr => {
        if (mkdirErr) {
            deferred.reject(mkdirErr);
        }
        else {
            fs.writeFile(filepath, JSON.stringify(obj), err => {
                if (err) {
                    deferred.reject(err);
                }
                else {
                    deferred.resolve(filepath);
                }
            });
        }
    });

    return deferred.promise;
}

function readFile (filepath) {
    const Q = require('q'),
        deferred = Q.defer(),
        fs = require('fs');

    fs.readFile(filepath, 'utf8', (err, data) => {
        if (err && err.code === 'ENOENT') {
            deferred.resolve(null);
        }
        else if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve(JSON.parse(data));
        }
    });

    return deferred.promise;
}

const Stub = {
    create: function (config) {
        const helpers = require('../util/helpers'),
            stub = helpers.clone(config || {});

        stub.responses = stub.responses || [{ is: {} }];

        stub.addResponse = () => {};

        stub.nextResponse = () => {};

        stub.deleteResponsesMatching = () => {};

        return stub;
    }
};

function create (config) {
    function first () {}

    function add (stub) {
        let stubFile, newStub;
        const path = require('path'),
            datadir = path.dirname(config.imposterFile);

        return readFile(config.imposterFile).then(header => {
            header.stubs = header.stubs || { batchSize: 100, dirs: [] };
            const nextIndex = header.stubs.dirs.length;
            stubFile = `${header.port}/stubs/${nextIndex}.json`;
            header.stubs.dirs.push(stubFile);
            return writeFile(config.imposterFile, header);
        }).then(() =>
            readFile(stubFile)
        ).then(stubList => {
            const responses = stub.responses || [],
                responseDir = stubFile.replace('.json', '') + '/responses';

            newStub = {
                predicates: stub.predicates,
                responseDirs: [],
                orderWithRepeats: [],
                nextIndex: 0
            };

            for (let i = 0; i < responses.length; i += 1) {
                newStub.responseDirs.push(`${responseDir}/${i}.json`);
                newStub.orderWithRepeats.push(i);
            }
            stubList = stubList || { stubs: [] };
            stubList.stubs.push(newStub);
            return writeFile(`${datadir}/${stubFile}`, stubList);
        }).then(() => {
            const Q = require('q'),
                promises = [Q(true)];

            for (let i = 0; i < stub.responses.length; i += 1) {
                promises.push(writeFile(`${datadir}/${newStub.responseDirs[i]}`, stub.responses[i]));
            }
            return Q.all(promises);
        });
    }

    function insertBefore () {}

    function insertAtIndex () {
    }

    function overwriteAll () {
    }

    function overwriteAtIndex () {
    }

    function deleteAtIndex () {
    }

    function getAll () {
    }

    return {
        count: () => 0,
        first,
        add,
        insertBefore,
        insertAtIndex,
        overwriteAll,
        overwriteAtIndex,
        deleteAtIndex,
        getAll,
        newStub: Stub.create
    };
}

module.exports = { create };
