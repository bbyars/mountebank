Stories/Tasks
=============

1. Validate proxy matches syntax (array?)
1. Add matchesExcept for proxies
1. Validation messages broken?  Test thoroughly
1. table of contents to interesting doc pages like proxy, predicates, injection
1. add behaviors: { wait: 5000 } to responses
2, release on branch
0. stub smtp with accept/reject behaviors
6. Add brew package
6. add pkg installer like vagrant
7. Add rpm package
8. Add MSI & Windows support
1. Add http attachment support
1. Allow regex tokens from request params in response (different resolver?)
21. Prettier /imposters HTML page
22. Ability to create imposter from UI for manual testers
23. Prettier /imposter/{port} HTML page
27. paging and q= filtering for imposters on GET /imposters
30. javadoc style documentation? (jsdoc3, or http://jashkenas.github.io/docco/)
31. Package npm without tests and files not needed for runtime
33. Change logs page to link the [http:2526] to the imposter page
  - would need to add createdAt field to imposter, and only link to imposters created after the timestamp
34. Pretty print JSON log messages on /logs page
35. Have query param on GET /imposters/{port} that returns slimmest possible payload to replay the imposter
        - exclude matches and requests
38. Add atom feed that only displays when --heroku is set that people can subscribe to for updates
39. dry run all stub resolvers, even if predicates fail or is second in the responses array

Known Bugs
==========
1. grunt does not kill mb if functional tests fail
2. TCP proxying doesn't work if proxied server doesn't send a response
   - add a timeout parameter, and always resolve if no response by that time?
3. Tests must have some race conditions; getting intermittent failures

Rainy day ideas to try out
=================================
The ideas below aren't guaranteed to be good ;>

1. Use cluster module to isolate imposters from each other?
2. UDP and TCP syslog support (see http://en.wikipedia.org/wiki/Syslog for packet format)
3. Change logs page to tail -f the logs file?
4. Add button next to code blocks on docs site that allows user to directly execute and compare the results
