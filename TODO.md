Stories
=======
0. fix encoding on tcp - utf8 or base64 or option?
0. add tcp validator
1. fix presentation for TCP on website
0. log remote socket everywhere
1. HTTPS support
1. or predicate
2. Create resolver to automatically create proxyOnce/is with predicates without
  setting the predicates up by hand
4. Better docs - with accordion examples for each operator,etc (see http://codepen.io/Thoughtworks/full/BEmsu)
4. Tests for documents that actually read a class in the HTML to try each request and verify response
3. Allow base mock expectation of SMTP
4. Allow advanced header expectation of SMTP
5. Allow body expectations of SMTP
6. Add brew package
7. Add rpm package
8. Use cluster module to isolate imposters from each other
8 release!!!!
8. Add MSI & Windows support
9. Better error handling around invalid JSON requests to make consistent error messages
1. Add latency to response
1. Add attachment support
1. Allow regex tokens from path/query in response
20. Prettier log output, with filtering, on website
21. Prettier /imposters HTML page
22. Ability to create imposter from UI (with karma testing?)
23. Prettier /imposter/{port} HTML page
25. change to only publish to npm and then deploy to heroku on branch
26. Add support for case-sensitive predicates (as objects instead of strings?)
27. Allow naming imposters to make log output more intelligible (retrofit tests!)

Known Bugs
==========
3. grunt does not kill mb if functional tests fail

Cleanup Needed
==============
- Allow case sensitive predicates
- figure out how to change logger settings, make command line param, or run-time switch?
- pass logger into to modules to auto-add imposter prefix
- set Q.longstacktrace for dev (command line switch?)
- echo mode: binary back when GET /imposters

Auxiliary Projects
==================
1. Java binding
2. C# binding
