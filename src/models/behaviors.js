'use strict';

/**
 * The functionality behind the _behaviors field in the API, supporting post-processing responses
 * @module
 */

var helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    Q = require('q'),
    exec = require('child_process').exec,
    util = require('util'),
    isWindows = require('os').platform().indexOf('win') === 0;

/**
 * Waits a specified number of milliseconds before sending the response.  Due to the approximate
 * nature of the timer, there is no guarantee that it will wait the given amount, but it will be close.
 * @param {Object} request - The request object
 * @param {Object} response - The response generated from the stubs
 * @param {Object} responsePromise -kThe promise returning the response
 * @param {number} millisecondsOrFn - The number of milliseconds to wait before returning, or a function returning milliseconds
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object} A promise resolving to the response
 */
function wait (request, response, responsePromise, millisecondsOrFn, logger) {
    if (request.isDryRun) {
        return responsePromise;
    }

    var fn = util.format('(%s)()', millisecondsOrFn),
        milliseconds = parseInt(millisecondsOrFn);

    if (isNaN(milliseconds)) {
        try {
            milliseconds = eval(fn);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(fn));
            logger.error('    request: ' + JSON.stringify(request));
            logger.error('    response: ' + JSON.stringify(response));
            return Q.reject(errors.InjectionError('invalid wait injection',
                { source: millisecondsOrFn, data: error.message }));
        }
    }

    logger.debug('Waiting %s ms...', milliseconds);
    return responsePromise.delay(milliseconds);
}

function quoteForShell (obj) {
    var json = JSON.stringify(obj);

    if (isWindows) {
        // Confused? Me too. All other approaches I tried were spectacular failures
        // in both 1) keeping the JSON as a single CLI arg, and 2) maintaining the inner quotes
        return util.format('"%s"', json.replace(/"/g, '\\"'));
    }
    else {
        return util.format("'%s'", json);
    }
}

/**
 * Runs the response through a shell function, passing the JSON in as stdin and using
 * stdout as the new response
 * @param {Object} request - Will be the first arg to the command
 * @param {Object} responsePromise - The promise chain for building the response, which will be the second arg
 * @param {string} command - The shell command to execute
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function shellTransform (request, responsePromise, command, logger) {
    if (request.isDryRun) {
        return responsePromise;
    }

    return responsePromise.then(function (response) {
        var deferred = Q.defer(),
            fullCommand = util.format('%s %s %s', command, quoteForShell(request), quoteForShell(response));

        logger.debug('Shelling out to %s', command);
        logger.debug(fullCommand);

        exec(fullCommand, function (error, stdout, stderr) {
            if (error) {
                if (stderr) {
                    logger.error(stderr);
                }
                deferred.reject(error.message);
            }
            else {
                logger.debug("Shell returned '%s'", stdout);
                try {
                    deferred.resolve(Q(JSON.parse(stdout)));
                }
                catch (err) {
                    deferred.reject(util.format("Shell command returned invalid JSON: '%s'", stdout));
                }
            }
        });
        return deferred.promise;
    });
}

/**
 * Runs the response through a post-processing function provided by the user
 * @param {Object} originalRequest - The request object, in case post-processing depends on it
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} fn - The function that performs the post-processing
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function decorate (originalRequest, responsePromise, fn, logger) {
    if (originalRequest.isDryRun === true) {
        return responsePromise;
    }

    return responsePromise.then(function (response) {
        var request = helpers.clone(originalRequest),
            injected = '(' + fn + ')(request, response, logger);';

        try {
            // Support functions that mutate response in place and those
            // that return a new response
            var result = eval(injected);
            if (!result) {
                result = response;
            }
            return Q(result);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(injected));
            logger.error('    request: ' + JSON.stringify(request));
            logger.error('    response: ' + JSON.stringify(response));
            return Q.reject(errors.InjectionError('invalid decorator injection', { source: injected, data: error.message }));
        }
    });
}

function isJSON (json) {
    try {
        JSON.parse(json);
    }
    catch (e) {
        return false;
    }
    return true;
}

function isXML (xml) {
    var parseString = require('xml2js').parseString,
        result = '';

    parseString(xml, function (err) {
        if (err === null) {
            result = true;
        }
        else {
            result = false;
        }
    });
    if (result === true) {
        return true;
    }
    else {
        return false;
    }
}

function isCheck (request) {
    var type = '';

    if (isXML(request)) {
        type = 'XML';
    }
    else if (isJSON(request)) {
        type = 'JSON';
    }
    return type;
}

/**
 * Runs the response through a post-processing function provided by the user
 * @param {Object} originalRequest - The request object, in case post-processing depends on it
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} fn - The function that performs the post-processing
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function copyFrom(originalRequest, responsePromise, fn, logger){
  return responsePromise.then(function (response) {
    var fn2 = "function (request, response) {}"
    var request = helpers.clone(originalRequest),
    injected = '(' + fn2 + ')(request, response, logger);';
    var json_parse=JSON.stringify(request['body']);

    if (request.isDryRun === true) {
      return response;
    }
    try {
      var result = eval(injected);
      if (!result) {
        result = response;
      }
      var request_type='';
      var Message_Type = originalRequest['body'];
      request_type= isCheck(Message_Type);

      var xpath = require('xpath');
      var dom = require('xmldom').DOMParser;
      var xml = originalRequest['body'];

      var parseJson = require('parse-json');
      var JSONPath  = require('jsonpath-plus');
      var JSON_req  = originalRequest['body'];

      var app_body  = result['body'];
      var Clean_Response = app_body;
      var title;

      var doc = new dom().parseFromString(xml);
      for (var key1 in fn)
      {
        for (var subkey1 in fn[key1])
        {
            var Param1 =  (fn[key1][subkey1]).toString();
                  if ((Param1.localeCompare("path")==0))
                  {
                  var query_uri = fn[key1]['uri'];
                  title = originalRequest.path.split('/')[fn[key1]['uri']];
                    if((title==undefined)||(title==null)||(title==""))
                    {
                    result['statusCode'] = 404;
                    result['body'] = "Copy criteria does not match"+'\r\n'+"Corresponding value of "+"\""+Param1+"\""+" is Undefined or null." ;
                    return Q(result);
                    }
                  var initial_index = 0;
                           do {
                            Clean_Response = Clean_Response.replace(fn[key1]['into'], title);
                                    } while((initial_index = Clean_Response.indexOf(fn[key1]['into'], initial_index + 1)) > -1);
                  }

                  if ((Param1.localeCompare("query")==0))
                  {
                  var query_param = fn[key1]['param'];
                  title = originalRequest.query[query_param];
                    if((title==undefined)||(title==null)||(title==""))
                    {
                    result['statusCode'] = 404;
                    result['body'] = "Copy criteria does not match"+'\r\n'+"Corresponding value of "+"\""+Param1+"\""+" is Undefined or null." ;
                    return Q(result);
                    }
                  var initial_index = 0;
                           do {
                            Clean_Response = Clean_Response.replace(fn[key1]['into'], title);
                                    } while((initial_index = Clean_Response.indexOf(fn[key1]['into'], initial_index + 1)) > -1);
                  }

                  if ((Param1.localeCompare("headers")==0))
                  {
                  var header_value = fn[key1]['value'];
                  title = originalRequest.headers[header_value];
                    if((title==undefined)||(title==null))
                    {
                    result['statusCode'] = 404;
                    result['body'] = "Copy criteria does not match"+'\r\n'+"Corresponding value of "+"\""+Param1+"\""+" is Undefined or null." ;
                    return Q(result);
                    }
                  var initial_index = 0;
                           do {
                            Clean_Response = Clean_Response.replace(fn[key1]['into'], title);
                                    } while((initial_index = Clean_Response.indexOf(fn[key1]['into'], initial_index + 1)) > -1);
                  }

                       for (var subkey2 in fn[key1][subkey1])
                        {
                            if ((subkey2).localeCompare("selector")==0)
                            {
                                var Req_path =  fn[key1][subkey1][subkey2];
                                if (request_type.localeCompare("XML")==0)
                                {
                                var doc = new dom().parseFromString(xml);
                                title= xpath.select(Req_path, doc).toString();
                                }
                                else if (request_type.localeCompare("JSON")==0) {
                                  var JSON_doc = parseJson(JSON_req);
                                  title= JSONPath(Req_path, JSON_doc).toString();
                                }
                                  if((title==undefined)||(title==null)||(title==""))
                                  {
                                  result['statusCode'] = 404;
                                 result['body'] = "Copy criteria does not match"+'\r\n'+"Corresponding value of "+"\""+subkey2+"\""+" is Undefined or null." ;
                                  return Q(result);
                                  }
                                var initial_index = 0;
                                                 do {
                                                  Clean_Response = Clean_Response.replace(fn[key1]['into'], title);
                                                          } while((initial_index = Clean_Response.indexOf(fn[key1]['into'], initial_index + 1)) > -1);
                            }
                        }
        }
      }
      result['body'] = Clean_Response;
      return Q(result);
    }
    catch (error) {
      logger.error('injection X=> ' + error);
      logger.error('    full source: ' + JSON.stringify(injected));
      logger.error('    request: ' + JSON.stringify(request));
      logger.error('    response: ' + JSON.stringify(response));
      return Q.reject(errors.InjectionError('invalid copyfrom injection', { source: injected, data: error.message }));
    }
  });
}

/**
 * The entry point to execute all behaviors provided in the API
 * @param {Object} request - The request object
 * @param {Object} response - The response generated from the stubs
 * @param {Object} behaviors - The behaviors specified in the API
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object}
 */
function execute (request, response, behaviors, logger) {
    var result = Q(response);

    if (!behaviors) {
        return result;
    }

    logger.debug('using stub response behavior ' + JSON.stringify(behaviors));

    if (behaviors.wait) {
        result = wait(request, response, result, behaviors.wait, logger);
    }
    if (behaviors.shellTransform) {
        result = shellTransform(request, result, behaviors.shellTransform, logger);
    }
    if (behaviors.decorate) {
        result = decorate(request, result, behaviors.decorate, logger);
    }
    if (behaviors.copyFrom) {
        result = copyFrom(request, result, behaviors.copyFrom, logger);
    }

    return result;
}

module.exports = {
    wait: wait,
    decorate: decorate,
    shellTransform: shellTransform,
    copyFrom: copyFrom,
    execute: execute
};
