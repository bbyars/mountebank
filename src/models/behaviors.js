'use strict';

/**
 * The functionality behind the _behaviors field in the API, supporting post-processing responses
 * @module
 */

var helpers = require('../util/helpers'),
    errors = require('../util/errors'),
    Q = require('q'),
    mountebank = require('../mountebank');

/**
 * Waits a specified number of milliseconds before sending the response.  Due to the approximate
 * nature of the timer, there is no guarantee that it will wait the given amount, but it will be close.
 * @param {Object} request - The request object
 * @param {Object} response - The response generated from the stubs
 * @param {Object} responsePromise -kThe promise returning the response
 * @param {number} milliseconds - The number of milliseconds to wait before returning
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object} A promise resolving to the response
 */
function wait (request, response, responsePromise, milliseconds, logger) {
    if (typeof milliseconds === 'number') {
        return responsePromise.delay(milliseconds);
    }
    else {
        try {
            var waitFunction = eval('(' + milliseconds + ')');
            return responsePromise.then(function () {
                return responsePromise.delay(waitFunction());
            });
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(milliseconds));
            logger.error('    request: ' + JSON.stringify(request));
            logger.error('    response: ' + JSON.stringify(response));
            return Q.reject(errors.InjectionError('invalid wait injection', { source: milliseconds, data: error.message }));
        }
    }
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
    return responsePromise.then(function (response) {
        var request = helpers.clone(originalRequest),
            injected = '(' + fn + ')(request, response, logger);';

        if (request.isDryRun === true) {
            return response;
        }
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

    var fn1=JSON.stringify(fn);
    var split_func= fn1.split("\"");
    var split_func_1= "\""+"###,"+split_func[1]+"\"";
    var fn2 = "function (request, response) { response.body = response.body+JSON.stringify("+"###(Replacer)"+");}"
    var res = fn2.replace("###(Replacer)", split_func_1);
    var request = helpers.clone(originalRequest),
    injected = '(' + res + ')(request, response, logger);';

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

      //string_a.localeCompare(string_b);
      //if (request_type.localeCompare("XML"))
      var xpath = require('xpath');
      var dom = require('xmldom').DOMParser;
      var xml = originalRequest['body'];
      //var doc = new dom().parseFromString(xml);

      var parseJson = require('parse-json');
      var JSONPath = require('jsonpath-plus');
      var JSON_req = originalRequest['body'];
      //var JSON_doc = parseJson(JSON_req);
      var app_body=result['body'];

      var Clean_Response = app_body.split("###");
      var len=Clean_Response.length;
      for(var ii=0;ii<len;ii++)
      {
        //loop through length of copyFrom injection function to determine number of parameters
        var t=Clean_Response[ii].length;
        if (Clean_Response[ii].charAt(0)=='"') Clean_Response[ii]=Clean_Response[ii].substring(1,t--);
        if (Clean_Response[ii].charAt(--t)=='"') Clean_Response[ii]=Clean_Response[ii].substring(0,t);
      }

      //Set clean response to 0 before looping through
      var Clean_Response_Save=Clean_Response[0];
      var Get_parameter = Clean_Response[1].split(",");
      var title;


      //Set i to 1 so that PATH variable begins with PATH1 rather than PATH0
      for(var i=1;i<Get_parameter.length;i++)
      {
        //Set index equal to parameter looping through, starting at PATH1
        var index='#{PATH'+(i)+'}';
        //console.log("Loop Index:"+i+" | value:"+Clean_Response[i]);
        if(Clean_Response_Save.includes(index))
        {
          if (request_type.localeCompare("XML")==0) {
            //console.log ("ENTERS into XML"+request_type+"===="+"XML");
            var doc = new dom().parseFromString(xml);
            //console.log("Clean_Response[i]"+Clean_Response[i]+"    "+doc);
            title= xpath.select(Get_parameter[i], doc).toString();

          }
          else if (request_type.localeCompare("JSON")==0) {
            //console.log ("ENTERS into JSON"+request_type+"===="+"JSON");
            var JSON_doc = parseJson(JSON_req);
            title= JSONPath(Get_parameter[i], JSON_doc).toString();
          }
          //Clean_Response_Save=Clean_Response_Save.replace(index, title );
          var initial_index = 0;
                        do {
                            Clean_Response_Save = Clean_Response_Save.replace(index, title);
                                    } while((initial_index = Clean_Response_Save.indexOf(index, initial_index + 1)) > -1);
        }
        else
        console.log("Couldnt Find: "+index+" at loop :"+i);
      }
      result['body'] = Clean_Response_Save;

      return Q(result);
    }
    //catch errors for function injection or malformed json
    catch (error) {
      logger.error('injection X=> ' + error);
      logger.error('    full source: ' + JSON.stringify(injected));
      logger.error('    request: ' + JSON.stringify(request));
      logger.error('    response: ' + JSON.stringify(response));
      return Q.reject(errors.InjectionError('invalid copyFrom injection', { source: injected, data: error.message }));
    }
  });
}

  // Function to check XML or JSON
  function isCheck(request)
  {
    var type='';

    if(isXML(request)) {
      type='XML';
    }
    else if(isJson(request)) {
      type='JSON';
    }
    return type;
  }

  //Function to verify the incoming message is JSON
  function isJson(json) {
    try {
      JSON.parse(json);
    } catch (e) {
      return false;
    }
    return true;
  }

  //Function to verify the incoming message is XML
  function isXML(xml) {
    var parseString = require('xml2js').parseString;
    var result_1='';

    parseString(xml, function (err, result) {
      if (err==null){
        result_1=true;
      }
      else {
        result_1=false;
      }
    });
    if (result_1==true){
      return true;
    }
    else
    return false;
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
    copyFrom: copyFrom,
    execute: execute
};
