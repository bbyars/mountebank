Stories
=======

1. Continuous publishing with versioning of npm module
9. Allow base stub of HTTP (make requests array to allow different responses)
4. Add coveralls.io (https://npmjs.org/package/grunt-mocha-cov)
5. Allow base mock expectation of SMTP
6. Allow advanced header expectation of SMTP
7. Allow body expectations of SMTP
7. Build Java implementation of SMTP mock
7. Wire up Java code in CI
8. Build C# implementation of SMTP mock
9. Wire up C# code in CI
10. Build HTML representation of mocks
11. Build HTML docs
12. Support HTML stubbing
13. Add rpm / nuget / brew etc packages so not dependent on node.js
14. Allow javascript injection for stubs to dynamically change behavior
  - maybe with a config switch to allow insecure, or do I care?

Tweaks
======

1. Consider getting rid of isPortInUse.  There's a race condition anyway with it.
   Just catch the exception and return the HTTP conflict code
