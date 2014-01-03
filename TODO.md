Stories
=======
4. Better docs - with accordion examples for each operator,etc (see http://codepen.io/Thoughtworks/full/BEmsu)
4. Tests for documents that actually read a class in the HTML to try each request and verify response
6. Add brew package
7. Add rpm package
8. Use cluster module to isolate imposters from each other
8. change to only publish to npm and then deploy to heroku on branch; bump major version
8 release!!!!
8. Add MSI & Windows support
9. Better error handling around invalid JSON requests to make consistent error messages
1. Add latency to response
1. Add http attachment support
1. Allow regex tokens from path/query in response
20. Prettier log output, with filtering, on website
21. Prettier /imposters HTML page
22. Ability to create imposter from UI (with karma testing?)
23. Prettier /imposter/{port} HTML page
26. Add support for case-sensitive predicates (as objects instead of strings?)
27. paging and q= filtering for imposters on GET /imposters
28. UDP and TCP syslog support (see http://en.wikipedia.org/wiki/Syslog for packet format)
30. javadoc style documentation? (look at simplesmtp code)

Known Bugs
==========
1. grunt does not kill mb if functional tests fail
2. TCP proxying doesn't work if proxied server doesn't send a response
   - add a timeout parameter, and always resolve if no response by that time?
3. TCP proxying only returns first data event (need callback instead of promise to callback multiple times?)

Cleanup Needed
==============
- fix docs - much of it out of date
  - injection has access to logger, but only error logs during dry runs
  - predicates for tcp are text only
  - predicate injection - can return truthy or falsy, but mountebank doesn't know what those words mean, so he suggests you return true or false
- come up with better name than 'remember' for proxyAll

Auxiliary Projects
==================
1. Java binding
2. C# binding
