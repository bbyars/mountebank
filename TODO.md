Stories
=======
6. Add brew package
6. add pkg installer like vagrant
7. Add rpm package
8. Add MSI & Windows support
8. Use cluster module to isolate imposters from each other?
1. Add latency to stub response
1. Add http attachment support
1. Allow regex tokens from request params in response (different resolver)
21. Prettier /imposters HTML page
22. Ability to create imposter from UI (with karma testing?)
23. Prettier /imposter/{port} HTML page
26. Add support for case-sensitive predicates (as objects instead of strings?)
27. paging and q= filtering for imposters on GET /imposters
28. UDP and TCP syslog support (see http://en.wikipedia.org/wiki/Syslog for packet format)
30. javadoc style documentation? (look at simplesmtp code)
31. Package npm without tests and files not needed for runtime
32. Change logs page to tail -f the logs file?
33. Change logs page to link the [http:2526] to the imposter page
34. Pretty print JSON log messages on /logs page
35. Have matches be returned only with a query param on GET and DELETE?  Allows for slimmer replays on proxies
36. Reorder the JSON to have the most important info at top (e.g. _links at bottom; tcp mode above stubs and requests)
37. Add button next to code blocks on docs site that allows user to directly execute and compare the results
38. Add atom feed that only displays when --heroku is set that people can subscribe to for updates
39. Add twitter handle that ppl can listen to for updates?

Known Bugs
==========
1. grunt does not kill mb if functional tests fail
2. TCP proxying doesn't work if proxied server doesn't send a response
   - add a timeout parameter, and always resolve if no response by that time?
3. TCP proxying only returns first data event (need callback instead of promise to callback multiple times?)

Cleanup Needed
==============
- can random port be grabbed by passing in 0?
        var server  = http.createServer()
        server.listen(0)
        server.on('listening', function() {
          var port = server.address().port
        })
- add warn logging for injection dry run calls

docs:
  - injection has access to logger, but only error logs during dry runs
  - predicates for tcp are text only
  - predicate injection - can return truthy or falsy, but mountebank doesn't know what those words mean, so he suggests you return true or false

smtp:
- stub smtp with accept/reject

tcp:
- allow multiple respond events?
    - TCP response should be an array of data elements?

Pre-release review
==================
API:
- are predicates OK or do I need another layer of indirection to add case-insensitivity, etc?
- come up with better name than 'remember' for proxyAll
- proxy and proxyAll are confusing - proxyAll doesn't always proxy, but proxy does
- separating behavior from data in responses (e.g. behaviours = 'wait', SMTP 'accept', 'reject', TCP: 'fin')
   - standard attribute, eg.:
   {
     statusCode: 400,
     body: 'bad',
     behaviors: {
       wait: 1000
     }

Auxiliary Projects
==================
1. Java binding
2. C# binding
