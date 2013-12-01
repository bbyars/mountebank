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

Future Directions
=================
1. Add HTML views for manual QA?
2. Docs and website support
3. Inline docs with mb app
4. FTP?

Known Bugs
==========
1. Does not ensure validation is purely synchronous in presence of injections
2. Does not seem to support asynchronous injection code
    - see commented out test in functionalTest/api/http/imposterTest.js
2. Injected code can crash mb
    - see commented out test in functionalTest/api/http/imposterTest.js
3. grunt does not kill mb if functional tests fail

Cleanup Needed
==============
2. Have delete return JSON
5. add error handler middleware like connect's

Auxiliary Projects
==================
1. Java binding
2. C# binding
3. bash import/export?
4. powershell import/export?
