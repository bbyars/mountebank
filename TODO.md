Stories
=======

1. HTML website
 - imposter management
   - create imposter
   - list imposters
   - show imposter details
 - karma testing?
1. Allow loading proxyOnce - test
1. Add query parameters as predicate, remove from path
1. Add latency to response
1. Add attachment support
1. Allow regex tokens from path/query in response
1. or predicate
1. analytics
1. favicon (mb)
1. heroku
1. HTTPS support
2. better logging
 - add logs to website
 - don't log HTML requests?
3. Allow base mock expectation of SMTP
4. Allow advanced header expectation of SMTP
5. Allow body expectations of SMTP
6. Add brew package
7. Add rpm package
8 release!!!!
8. Add MSI & Windows support
9. Better error handling around invalid JSON requests to make consistent error messages

Known Bugs
==========
2. Does not support asynchronous injection code
    - see commented out test in functionalTest/api/http/stubTest.js
    - validation does not guarantee strictly synchronous execution with injection
3. grunt does not kill mb if functional tests fail

Cleanup Needed
==============

Auxiliary Projects
==================
1. Java binding
2. C# binding
