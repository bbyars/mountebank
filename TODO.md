Stories
=======

1. Switch to coarse-grained resources:
  - POST /imposters allows passing stubs in bulk (good for file loading)
  - PATCH? /imposters/:id allows passing requests and stubs (to reset with only one call)
  - remove /imposters/:id/requests and /imposters/:id/stubs
1. HTTPS support
2. better logging
3. Allow base mock expectation of SMTP
4. Allow advanced header expectation of SMTP
5. Allow body expectations of SMTP
6. Add brew package
7. Add rpm package
8. Add MSI & Windows support
9. FTP

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
