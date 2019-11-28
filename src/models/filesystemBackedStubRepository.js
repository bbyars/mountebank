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

function repeatsFor (response) {
    if (response._behaviors && response._behaviors.repeat) {
        return response._behaviors.repeat;
    }
    else {
        return 1;
    }
}

function create (config) {
    const headerFile = `${config.imposterDir}/imposter.json`;

    function readHeader () {
        const errors = require('../util/errors'),
            Q = require('q');

        return readFile(headerFile).then(imposter => {
            if (imposter === null) {
                return Q.reject(errors.DatabaseError(`no imposter file: ${headerFile}`));
            }
            return Q(imposter);
        });
    }

    function first (filter) {
        return readHeader().then(imposter => {
            const stubs = imposter.stubs || [],
                helpers = require('../util/helpers'),
                match = stubs.find(filter);

            if (typeof match === 'undefined') {
                return match;
            }
            else {
                const cloned = helpers.clone(match);
                delete cloned.meta;
                return cloned;
            }
        });
    }

    function add (stub) {
        const stubDefinition = {
                predicates: stub.predicates || [],
                meta: {
                    responseFiles: [],
                    orderWithRepeats: [],
                    nextIndex: 0
                }
            },
            responses = stub.responses || [],
            Q = require('q'),
            promises = [];

        return readHeader().then(imposter => {
            imposter.stubs = imposter.stubs || [];
            const stubDir = `stubs/${imposter.stubs.length}`;

            for (let i = 0; i < responses.length; i += 1) {
                const responseFile = `${stubDir}/responses/${i}.json`;
                stubDefinition.meta.responseFiles.push(responseFile);

                for (let repeats = 0; repeats < repeatsFor(responses[i]); repeats += 1) {
                    stubDefinition.meta.orderWithRepeats.push(i);
                }

                promises.push(writeFile(`${config.imposterDir}/${responseFile}`, responses[i]));
            }

            imposter.stubs.push(stubDefinition);
            promises.push(writeFile(headerFile, imposter));
            return Q.all(promises);
        });
    }

    function insertBefore () {
    }

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
