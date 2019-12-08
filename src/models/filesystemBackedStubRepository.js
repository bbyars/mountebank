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

function remove (path) {
    const Q = require('q'),
        deferred = Q.defer(),
        fs = require('fs-extra');

    fs.remove(path, err => {
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

    function next (paths, template) {
        if (paths.length === 0) {
            return template.replace('${index}', 0);
        }

        const numbers = paths.map(file => parseInt(file.match(/\d+/)[0])),
            max = Math.max(...numbers);

        return template.replace('${index}', max + 1);
    }

    function wrap (stub, index) {
        const Response = require('./response');

        if (typeof stub === 'undefined') {
            return {
                addResponse: () => {},
                deleteResponsesMatching: () => {},
                nextResponse: () => Response.create()
            };
        }

        const helpers = require('../util/helpers'),
            cloned = helpers.clone(stub);

        delete cloned.meta;

        cloned.addResponse = response => {
            return readHeader().then(imposter => {
                const promises = [],
                    saved = imposter.stubs[index],
                    responseFile = next(saved.meta.responseFiles, 'responses/${index}.json'),
                    responseIndex = saved.meta.responseFiles.length,
                    Q = require('q');

                saved.meta.responseFiles.push(responseFile);
                for (let repeats = 0; repeats < repeatsFor(response); repeats += 1) {
                    saved.meta.orderWithRepeats.push(responseIndex);
                }

                promises.push(writeFile(`${config.imposterDir}/${saved.meta.dir}/${responseFile}`, response));
                promises.push(writeFile(headerFile, imposter));
                return Q.all(promises);
            });
        };

        cloned.deleteResponsesMatching = filter => {
            return readHeader().then(imposter => {
                const savedStub = imposter.stubs[index].meta,
                    stubDir = `${config.imposterDir}/${savedStub.dir}`,
                    loadResponses = savedStub.responseFiles.map(file => readFile(`${stubDir}/${file}`)),
                    Q = require('q');

                return Q.all(loadResponses).then(responses => {
                    const deletes = [];

                    for (let i = responses.length - 1; i >= 0; i -= 1) {
                        if (filter(responses[i])) {
                            deletes.push(remove(`${stubDir}/${savedStub.responseFiles[i]}`));
                            savedStub.responseFiles.splice(i, 1);
                            savedStub.orderWithRepeats = savedStub.orderWithRepeats
                                .filter(responseIndex => responseIndex !== i)
                                .map(responseIndex => {
                                    if (responseIndex > i) {
                                        return responseIndex - 1;
                                    }
                                    else {
                                        return responseIndex;
                                    }
                                });
                        }
                    }

                    if (deletes.length > 0) {
                        deletes.push(writeFile(headerFile, imposter));
                        return Q.all(deletes);
                    }
                    else {
                        return Q(true);
                    }
                });
            });
        };

        cloned.nextResponse = () => {
            return readHeader().then(imposter => {
                const meta = imposter.stubs[index].meta,
                    stubDir = `${config.imposterDir}/${meta.dir}`,
                    maxIndex = meta.orderWithRepeats.length,
                    responseIndex = meta.orderWithRepeats[meta.nextIndex % maxIndex],
                    responseFile = meta.responseFiles[responseIndex],
                    Q = require('q');

                meta.nextIndex = (meta.nextIndex + 1) % maxIndex;
                return Q.all([readFile(`${stubDir}/${responseFile}`), writeFile(headerFile, imposter)]);
            }).then(results => Response.create(results[0]));
        };

        return cloned;
    }

    function count () {
        return readHeader().then(imposter => {
            const stubs = imposter.stubs || [];
            return stubs.length;
        });
    }

    function first (filter) {
        return readHeader().then(imposter => {
            const stubs = imposter.stubs || [];

            for (let i = 0; i < stubs.length; i += 1) {
                if (filter(stubs[i])) {
                    return { success: true, index: i, stub: wrap(stubs[i], i) };
                }
            }
            return { success: false, index: -1, stub: wrap() };
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
            stubDefinition.meta.dir = next(imposter.stubs.map(saved => saved.meta.dir), 'stubs/${index}');

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

    function overwriteAtIndex (stub, index) {
        return deleteAtIndex(index).then(() => insertAtIndex(stub, index));
    }

    function all () {
        return readHeader().then(imposter => {
            const stubs = imposter.stubs || [];
            return stubs.map(wrap);
        });
    }

    return {
        count,
        first,
        add,
        insertAtIndex,
        overwriteAll,
        overwriteAtIndex,
        deleteAtIndex,
        all
    };
}

module.exports = { create };
