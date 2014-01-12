Stories
=======
1. add behaviors: { wait: 5000 } to responses
0. stub smtp with accept/reject
6. Add brew package
6. add pkg installer like vagrant
7. Add rpm package
8. Add MSI & Windows support
1. Add http attachment support
1. Allow regex tokens from request params in response (different resolver)
21. Prettier /imposters HTML page
22. Ability to create imposter from UI (with karma testing?)
23. Prettier /imposter/{port} HTML page
26. Add support for case-sensitive predicates (as objects instead of strings?)
27. paging and q= filtering for imposters on GET /imposters
30. javadoc style documentation? (look at simplesmtp code)
31. Package npm without tests and files not needed for runtime
33. Change logs page to link the [http:2526] to the imposter page
  - would need to add createdAt field to imposter, and only link to imposters created after the timestamp
34. Pretty print JSON log messages on /logs page
35. Have query param on GET /imposters/{port} that returns slimmest possible payload to replay the imposter
        - exclude matches and requests
38. Add atom feed that only displays when --heroku is set that people can subscribe to for updates

Known Bugs
==========
1. grunt does not kill mb if functional tests fail
2. TCP proxying doesn't work if proxied server doesn't send a response
   - add a timeout parameter, and always resolve if no response by that time?
3. Tests must have some race conditions; getting intermittent failures

Cleanup Needed
==============
check all links

API:
- are predicates OK or do I need another layer of indirection to add case-insensitivity, etc?
- come up with better name than 'remember' for proxyAll
- proxy and proxyAll are confusing - proxyAll doesn't always proxy, but proxy does

Rainy day ideas to try out
=================================
The ideas below aren't guaranteed to be good ;>

1. Use cluster module to isolate imposters from each other?
2. UDP and TCP syslog support (see http://en.wikipedia.org/wiki/Syslog for packet format)
3. Change logs page to tail -f the logs file?
4. Add button next to code blocks on docs site that allows user to directly execute and compare the results
