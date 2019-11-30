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

function remove (dir) {
    const Q = require('q'),
        deferred = Q.defer(),
        fs = require('fs-extra');

    fs.remove(dir, err => {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve({});
        }
    });

    return deferred.promise;
}

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

    function count () {
        return readHeader().then(imposter => {
            const stubs = imposter.stubs || [];
            return stubs.length;
        });
    }

    function first (filter) {
        return readHeader().then(imposter => {
            const stubs = imposter.stubs || [],
                helpers = require('../util/helpers'),
                defaultStub = { nextResponse: () => require('./response').create() };

            for (let i = 0; i < stubs.length; i += 1) {
                if (filter(stubs[i])) {
                    const cloned = helpers.clone(stubs[i]);
                    delete cloned.meta;
                    return { success: true, index: i, stub: cloned };
                }
            }
            return { success: false, index: -1, stub: defaultStub };
        });
    }

    function add (stub) {
        return insertAtIndex(stub, 99999999);
    }

    function insertAtIndex (stub, index) {
        const stubDefinition = {
                predicates: stub.predicates || [],
                meta: {
                    dir: '',
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
            stubDefinition.meta.dir = `stubs/${imposter.stubs.length}`;

            for (let i = 0; i < responses.length; i += 1) {
                const responseFile = `responses/${i}.json`;
                stubDefinition.meta.responseFiles.push(responseFile);

                for (let repeats = 0; repeats < repeatsFor(responses[i]); repeats += 1) {
                    stubDefinition.meta.orderWithRepeats.push(i);
                }

                promises.push(writeFile(`${config.imposterDir}/${stubDefinition.meta.dir}/${responseFile}`, responses[i]));
            }

            imposter.stubs.splice(index, 0, stubDefinition);
            promises.push(writeFile(headerFile, imposter));
            return Q.all(promises);
        });
    }

    function deleteAtIndex (index) {
        return readHeader().then(imposter => {
            const errors = require('../util/errors'),
                Q = require('q'),
                stubs = imposter.stubs || [],
                promises = [];

            if (typeof stubs[index] === 'undefined') {
                return Q.reject(errors.MissingResourceError(`no stub at index ${index}`));
            }

            promises.push(remove(`${config.imposterDir}/${stubs[index].meta.dir}`));
            imposter.stubs.splice(index, 1);
            promises.push(writeFile(headerFile, imposter));
            return Q.all(promises);
        });
    }

    function overwriteAll (newStubs) {
        const Q = require('q');

        return readHeader().then(imposter => {
            const deletePromises = [];
            imposter.stubs = [];
            deletePromises.push(remove(`${config.imposterDir}/stubs`));
            deletePromises.push(writeFile(headerFile, imposter));
            return Q.all(deletePromises);
        }).then(() => {
            let addSequence = Q(true);
            newStubs.forEach(stub => {
                addSequence = addSequence.then(() => add(stub));
            });
            return addSequence;
        });
    }

    function overwriteAtIndex () {
    }

    function getAll () {
    }

    return {
        count,
        first,
        add,
        insertAtIndex,
        overwriteAll,
        overwriteAtIndex,
        deleteAtIndex,
        getAll
    };
}

module.exports = { create };
